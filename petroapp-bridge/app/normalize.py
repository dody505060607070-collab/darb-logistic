from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Mapping
from zoneinfo import ZoneInfo

from .errors import SourceDataError
from .models import BillsPage, NormalizedTransaction

RIYADH = ZoneInfo("Asia/Riyadh")
ALWAYS_UNAVAILABLE = ["provider_card_ref", "card_last4", "full_tank"]


def normalize_bills(
    rows: Iterable[Mapping[str, Any]], payment_status_map: Mapping[str, str]
) -> BillsPage:
    transactions: list[dict[str, Any]] = []
    state_unavailable = False
    for row in rows:
        transaction = _normalize_bill(row, payment_status_map)
        state_unavailable |= transaction.provider_state is None
        transactions.append(transaction.to_contract_dict())
    unavailable = list(ALWAYS_UNAVAILABLE)
    if state_unavailable:
        unavailable.append("provider_state")
    return BillsPage(transactions=transactions, unavailable_fields=unavailable)


def _normalize_bill(
    row: Mapping[str, Any], payment_status_map: Mapping[str, str]
) -> NormalizedTransaction:
    transaction_id = row.get("id")
    if isinstance(transaction_id, bool) or not isinstance(transaction_id, int):
        raise SourceDataError()

    occurred_at = _occurred_at(row.get("date"))
    vehicle_id = row.get("vehicle_id")
    if vehicle_id is not None and (
        isinstance(vehicle_id, bool) or not isinstance(vehicle_id, int)
    ):
        raise SourceDataError()

    station = _optional_text(row.get("station_name")) or _optional_text(
        row.get("station")
    )
    raw_status = row.get("payment_status")
    # Exact, case-sensitive mapping only. Unknown/missing values remain unmapped.
    provider_state = (
        payment_status_map.get(raw_status) if isinstance(raw_status, str) else None
    )

    return NormalizedTransaction(
        provider_txn_id=str(transaction_id),
        occurred_at=occurred_at,
        provider_vehicle_ref=str(vehicle_id) if vehicle_id is not None else None,
        provider_card_ref=None,
        card_last4=None,
        station=station,
        fuel_type=_optional_text(row.get("fuel_type_title")),
        liters=_decimal_text(row.get("number_of_liters"), strictly_positive=True),
        unit_price=_decimal_text(row.get("fuel_price")),
        amount=_decimal_text(row.get("cost_inc_vat")),
        # Raw, staged-only reading. Its unit remains unknown.
        odometer=_decimal_text(row.get("odo")),
        provider_state=provider_state,
        full_tank=None,
    )


def _occurred_at(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SourceDataError()
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise SourceDataError() from exc
    if parsed.tzinfo is None:
        # Documented bridge convention for timezone-less ISO values, not a source claim.
        parsed = parsed.replace(tzinfo=RIYADH)
    return parsed.astimezone(ZoneInfo("UTC")).isoformat().replace("+00:00", "Z")


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise SourceDataError()
    return value.strip() or None


def _decimal_text(value: Any, strictly_positive: bool = False) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise SourceDataError()
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise SourceDataError() from exc
    if not parsed.is_finite() or parsed < 0 or (strictly_positive and parsed <= 0):
        raise SourceDataError()
    return format(parsed, "f")
