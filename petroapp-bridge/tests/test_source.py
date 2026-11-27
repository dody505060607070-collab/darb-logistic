from __future__ import annotations

import logging
from datetime import datetime

import httpx
import pytest

from app.config import Settings, _payment_status_map
from app.errors import BridgeError
from app.models import BillsWindow
from app.source import PetroAppBillsClient

from conftest import bill


def window() -> BillsWindow:
    return BillsWindow(
        **{
            "from": datetime.fromisoformat("2026-11-01T00:00:00+00:00"),
            "to": datetime.fromisoformat("2026-11-02T00:00:00+00:00"),
        }
    )


@pytest.mark.asyncio
async def test_transient_status_retries_with_bounded_backoff(settings: Settings) -> None:
    calls = 0
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"data": []})

    client = PetroAppBillsClient(
        settings, transport=httpx.MockTransport(handler), sleep=fake_sleep
    )
    assert await client.fetch_bills(window()) == []
    assert calls == 3
    assert sleeps == [0.5, 1.0]


@pytest.mark.asyncio
async def test_network_retries_then_safe_error(settings: Settings) -> None:
    calls = 0
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("synthetic network failure", request=request)

    client = PetroAppBillsClient(
        settings, transport=httpx.MockTransport(handler), sleep=fake_sleep
    )
    with pytest.raises(BridgeError) as caught:
        await client.fetch_bills(window())
    assert caught.value.error == "source_unavailable"
    assert calls == 3
    assert sleeps == [0.5, 1.0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "body", "expected_error", "expected_status"),
    [
        (401, {"data": []}, "auth_expired", 401),
        (403, {"data": []}, "auth_expired", 401),
        (429, {"data": []}, "rate_limited", 429),
        (200, "Too many attempts", "rate_limited", 429),
        (200, "CAPTCHA required", "rate_limited", 429),
        (200, "security warning", "rate_limited", 429),
        (400, {"data": []}, "source_error", 502),
    ],
)
async def test_immediate_stop_has_no_retry(
    settings: Settings,
    status: int,
    body: object,
    expected_error: str,
    expected_status: int,
) -> None:
    calls = 0

    async def fail_sleep(_seconds: float) -> None:
        raise AssertionError("must not sleep or retry")

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if isinstance(body, str):
            return httpx.Response(status, text=body)
        return httpx.Response(status, json=body)

    client = PetroAppBillsClient(
        settings, transport=httpx.MockTransport(handler), sleep=fail_sleep
    )
    with pytest.raises(BridgeError) as caught:
        await client.fetch_bills(window())
    assert caught.value.error == expected_error
    assert caught.value.status_code == expected_status
    assert calls == 1


@pytest.mark.asyncio
async def test_no_secret_or_raw_row_logging(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"data": [bill(id=987654)]})

    client = PetroAppBillsClient(settings, transport=httpx.MockTransport(handler))
    with caplog.at_level(logging.WARNING):
        with pytest.raises(BridgeError):
            await client.fetch_bills(window())
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "test-source-token" not in logged
    assert "test-fingerprint" not in logged
    assert "test-bridge-token" not in logged
    assert "987654" not in logged
    assert "unused_sensitive_field" not in logged


def test_payment_status_mapping_is_exact_and_validated() -> None:
    assert _payment_status_map('{"Paid":"completed"}') == {"Paid": "completed"}
    assert _payment_status_map("{}") == {}
    for invalid in [
        "not-json",
        "[]",
        '{"Paid":"paid"}',
        '{"Paid":true}',
        "{1:\"completed\"}",
    ]:
        with pytest.raises(ValueError):
            _payment_status_map(invalid)
