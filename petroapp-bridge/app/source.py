from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any, Mapping
from zoneinfo import ZoneInfo

import httpx

from .config import Settings
from .errors import BridgeError, SourceDataError
from .models import BillsWindow

SOURCE_BILLS_URL = "https://app.petroapp.com.sa/dashboard_api/bills"
RIYADH = ZoneInfo("Asia/Riyadh")
TRANSIENT_STATUSES = {502, 503, 504}
SECURITY_MARKERS = (
    "too many attempts",
    "too many requests",
    "rate limit",
    "rate-limit",
    "captcha",
    "security warning",
)
logger = logging.getLogger("petroapp_bridge.source")


class PetroAppBillsClient:
    """One observed read-only GET. No pagination or other provider capability is assumed."""

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.settings = settings
        self.transport = transport
        self.sleep = sleep

    async def fetch_bills(self, window: BillsWindow) -> list[Mapping[str, Any]]:
        if not self.settings.source_configured:
            raise BridgeError(
                503,
                "missing_source_config",
                "Source credentials are not configured on the bridge",
            )
        params = source_query(window)
        for attempt in range(self.settings.source_attempts):
            try:
                response = await self._get(params)
            except (httpx.TimeoutException, httpx.NetworkError):
                if attempt + 1 < self.settings.source_attempts:
                    await self.sleep(0.5 * (2**attempt))
                    continue
                logger.warning("Source network retry budget exhausted")
                raise BridgeError(
                    503, "source_unavailable", "The source could not be reached"
                ) from None

            if response.status_code in {401, 403}:
                logger.warning("Source authentication stopped the request")
                raise BridgeError(
                    401, "auth_expired", "The source session was rejected"
                )
            if response.status_code == 429 or _has_security_warning(response):
                logger.warning("Source limit or security warning stopped the request")
                raise BridgeError(
                    429,
                    "rate_limited",
                    "The source requested a stop; no retry was made",
                )
            if response.status_code in TRANSIENT_STATUSES:
                if attempt + 1 < self.settings.source_attempts:
                    await self.sleep(0.5 * (2**attempt))
                    continue
                raise BridgeError(
                    503, "source_unavailable", "The source is temporarily unavailable"
                )
            if response.status_code != 200:
                raise BridgeError(
                    502, "source_error", "The source returned an unsupported response"
                )
            return _data_rows(response)
        raise AssertionError("unreachable")

    async def health(self) -> None:
        now = datetime.now(tz=ZoneInfo("UTC"))
        window = BillsWindow(**{"from": now - timedelta(days=1), "to": now})
        await self.fetch_bills(window)

    async def _get(self, params: Mapping[str, str | int]) -> httpx.Response:
        timeout = httpx.Timeout(self.settings.source_timeout_seconds)
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=False,
            transport=self.transport,
        ) as client:
            return await client.get(
                SOURCE_BILLS_URL,
                params=params,
                headers={
                    "Authorization": f"Bearer {self.settings.source_bearer_token}",
                    "fingerprint": self.settings.source_fingerprint,
                    "Accept": "application/json",
                },
            )


def source_query(window: BillsWindow) -> dict[str, str | int]:
    """Exact captured query keys/values; page 1 and limit 10 are hard caps."""
    from_date = window.from_.astimezone(RIYADH).strftime("%Y/%m/%d")
    to_date = window.to.astimezone(RIYADH).strftime("%Y/%m/%d")
    return {
        "dates": f"{from_date}-{to_date}",
        "date_filter": "last_90_days",
        "order_by": "",
        "limit": 10,
        "page": 1,
        "order_type": "",
    }


def _data_rows(response: httpx.Response) -> list[Mapping[str, Any]]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise SourceDataError() from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise SourceDataError()
    rows = payload["data"]
    if any(not isinstance(row, dict) for row in rows):
        raise SourceDataError()
    # Never trust the source to enlarge the captured hard cap.
    return [row for row in rows[:10] if isinstance(row, dict)]


def _has_security_warning(response: httpx.Response) -> bool:
    # Inspection is in memory only. Response text and rows are never logged or returned.
    text = response.text[:65536].lower()
    return any(marker in text for marker in SECURITY_MARKERS)
