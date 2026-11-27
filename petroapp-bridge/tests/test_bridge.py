from __future__ import annotations

import json
from urllib.parse import parse_qs

import httpx
import pytest

from app.config import Settings
from app.main import create_app

from conftest import api_client, app_with_handler, bill


@pytest.mark.asyncio
async def test_livez_is_unauthenticated_and_never_calls_source() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"data": []})

    unconfigured = Settings(
        bridge_token="",
        source_bearer_token="",
        source_fingerprint="",
        payment_status_map={},
    )
    app = create_app(unconfigured, transport=httpx.MockTransport(handler))
    async with await api_client(app) as client:
        response = await client.get("/livez")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert calls == 0


@pytest.mark.asyncio
async def test_bridge_auth_is_required_before_any_source_call(
    settings: Settings, window: dict[str, object]
) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"data": []})

    app = app_with_handler(settings, handler)
    async with await api_client(app) as client:
        assert (await client.post("/v1/petroapp/preview", json=window)).status_code == 401
        assert (
            await client.post(
                "/v1/petroapp/preview",
                json=window,
                headers={"Authorization": "Bearer wrong"},
            )
        ).status_code == 401
        assert (await client.get("/health")).status_code == 401
    assert calls == 0


@pytest.mark.asyncio
async def test_preview_uses_exact_capture_and_maps_only_observed_fields(
    settings: Settings, auth: dict[str, str], window: dict[str, object]
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [bill()]})

    app = app_with_handler(settings, handler)
    async with await api_client(app) as client:
        response = await client.post(
            "/v1/petroapp/preview", json=window, headers=auth
        )

    assert response.status_code == 200
    assert len(requests) == 1
    source = requests[0]
    assert source is not None
    assert source.method == "GET"
    assert source.url.path == "/dashboard_api/bills"
    assert parse_qs(source.url.query.decode(), keep_blank_values=True) == {
        "dates": ["2026/11/01-2026/11/02"],
        "date_filter": ["last_90_days"],
        "order_by": [""],
        "limit": ["10"],
        "page": ["1"],
        "order_type": [""],
    }
    assert source.headers["Authorization"] == "Bearer test-source-token"
    assert source.headers["fingerprint"] == "test-fingerprint"

    page = response.json()
    assert page["next_cursor"] is None
    assert page["transactions"] == [
        {
            "provider_txn_id": "123",
            "occurred_at": "2026-11-01T09:00:00Z",
            "provider_vehicle_ref": "456",
            "provider_card_ref": None,
            "card_last4": None,
            "station": "Observed station",
            "fuel_type": "Diesel",
            "liters": "50.25",
            "unit_price": "2.10",
            "amount": "105.53",
            "odometer": "123456",
            "provider_state": "completed",
            "full_tank": None,
        }
    ]
    assert "unused_sensitive_field" not in json.dumps(page)
    assert page["unavailable_fields"] == [
        "provider_card_ref",
        "card_last4",
        "full_tank",
    ]


@pytest.mark.asyncio
async def test_station_fallback_cancelled_and_unknown_state(
    settings: Settings, auth: dict[str, str], window: dict[str, object]
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [
                    bill(id=1, station_name="", payment_status="EXACT_VOID"),
                    bill(id=2, payment_status="paid"),
                    bill(id=3, payment_status=None),
                ]
            },
        )

    app = app_with_handler(settings, handler)
    async with await api_client(app) as client:
        response = await client.post(
            "/v1/petroapp/sync", json=window, headers=auth
        )
    assert response.status_code == 200
    rows = response.json()["transactions"]
    assert rows[0]["station"] == "Fallback station"
    assert rows[0]["provider_state"] == "cancelled"
    assert "provider_state" not in rows[1]
    assert "provider_state" not in rows[2]
    assert "provider_state" in response.json()["unavailable_fields"]


@pytest.mark.asyncio
async def test_riyadh_query_dates_and_hard_row_cap(
    settings: Settings, auth: dict[str, str]
) -> None:
    captured: httpx.Request | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured
        captured = request
        return httpx.Response(200, json={"data": [bill(id=i) for i in range(12)]})

    app = app_with_handler(settings, handler)
    async with await api_client(app) as client:
        response = await client.post(
            "/v1/petroapp/preview",
            json={
                "from": "2026-11-01T21:30:00Z",
                "to": "2026-11-03T00:30:00+03:00",
                "limit": 50,
            },
            headers=auth,
        )
    assert response.status_code == 200
    assert len(response.json()["transactions"]) == 10
    assert captured is not None
    assert parse_qs(captured.url.query.decode(), keep_blank_values=True)["dates"] == [
        "2026/11/02-2026/11/03"
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [
        {"from": "2026-11-01", "to": "2026-11-02"},
        {"from": "2026-11-01T00:00:00Z", "to": "2026-12-03T00:00:00Z"},
        {"from": "2026-11-02T00:00:00Z", "to": "2026-11-01T00:00:00Z"},
        {"cursor": "page-2"},
        {"limit": 201},
        {"limit": 0},
    ],
)
async def test_invalid_windows_are_rejected_without_source_calls(
    settings: Settings,
    auth: dict[str, str],
    window: dict[str, object],
    change: dict[str, object],
) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"data": []})

    body = {**window, **change}
    app = app_with_handler(settings, handler)
    async with await api_client(app) as client:
        response = await client.post(
            "/v1/petroapp/sync", json=body, headers=auth
        )
    assert response.status_code == 422
    assert calls == 0


@pytest.mark.asyncio
async def test_health_success_and_missing_source_configuration(
    settings: Settings, auth: dict[str, str]
) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"data": []})

    app = app_with_handler(settings, handler)
    async with await api_client(app) as client:
        response = await client.get("/health", headers=auth)
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert calls == 1

    missing = Settings(
        bridge_token="test-bridge-token",
        source_bearer_token="",
        source_fingerprint="",
        payment_status_map={},
    )
    unconfigured = create_app(missing, transport=httpx.MockTransport(handler))
    async with await api_client(unconfigured) as client:
        response = await client.get("/health", headers=auth)
    assert response.status_code == 503
    assert response.json()["error"] == "missing_source_config"
    assert calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "rows",
    [
        {},
        {"data": {}},
        {"data": ["not an object"]},
        {"data": [bill(date="not-a-date")]},
        {"data": [bill(id="not-an-integer")]},
        {"data": [bill(number_of_liters="NaN")]},
        {"data": [bill(number_of_liters="0")]},
    ],
)
async def test_invalid_source_schema_is_not_normalized(
    settings: Settings,
    auth: dict[str, str],
    window: dict[str, object],
    rows: object,
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=rows)

    app = app_with_handler(settings, handler)
    async with await api_client(app) as client:
        response = await client.post(
            "/v1/petroapp/preview", json=window, headers=auth
        )
    assert response.status_code == 502
    assert response.json()["error"] == "source_data"
