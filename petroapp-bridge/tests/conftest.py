from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings() -> Settings:
    return Settings(
        bridge_token="test-bridge-token",
        source_bearer_token="test-source-token",
        source_fingerprint="test-fingerprint",
        payment_status_map={"EXACT_PAID": "completed", "EXACT_VOID": "cancelled"},
    )


@pytest.fixture
def auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-bridge-token"}


@pytest.fixture
def window() -> dict[str, Any]:
    return {
        "from": "2026-11-01T00:00:00Z",
        "to": "2026-11-02T00:00:00Z",
        "limit": 200,
        "cursor": None,
    }


def bill(**overrides: Any) -> dict[str, Any]:
    value: dict[str, Any] = {
        "id": 123,
        "date": "2026-11-01T12:00:00+03:00",
        "vehicle_id": 456,
        "station": "Fallback station",
        "station_name": "Observed station",
        "fuel_type_title": "Diesel",
        "number_of_liters": "50.25",
        "fuel_price": "2.10",
        "cost_inc_vat": "105.53",
        "odo": 123456,
        "payment_status": "EXACT_PAID",
        "unused_sensitive_field": "must not be copied",
    }
    value.update(overrides)
    return value


async def api_client(
    app: Any,
) -> httpx.AsyncClient:
    # Caller owns and closes the returned client.
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://bridge.test"
    )


def app_with_handler(settings: Settings, handler: Any) -> Any:
    return create_app(settings, transport=httpx.MockTransport(handler))
