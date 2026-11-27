from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


MAX_WINDOW = timedelta(days=31)


class BillsWindow(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: datetime = Field(alias="from")
    to: datetime
    cursor: str | None = None
    limit: int = Field(default=10, ge=1, le=200)

    @model_validator(mode="after")
    def validate_window(self) -> "BillsWindow":
        if self.from_.tzinfo is None or self.to.tzinfo is None:
            raise ValueError("from and to must include a timezone")
        if self.to <= self.from_ or self.to - self.from_ > MAX_WINDOW:
            raise ValueError("The window must be positive and no longer than 31 days")
        if self.cursor is not None:
            raise ValueError("Pagination cursors are not supported by the capture")
        return self


class NormalizedTransaction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_txn_id: str
    occurred_at: str
    provider_vehicle_ref: str | None = None
    provider_card_ref: str | None = None
    card_last4: str | None = None
    station: str | None = None
    fuel_type: str | None = None
    liters: str | None = None
    unit_price: str | None = None
    amount: str | None = None
    odometer: str | None = None
    provider_state: Literal["completed", "cancelled"] | None = None
    full_tank: bool | None = None

    def to_contract_dict(self) -> dict[str, Any]:
        value = self.model_dump()
        if self.provider_state is None:
            # Darb requires this key and intentionally rejects the row when it is absent.
            value.pop("provider_state")
        return value


class BillsPage(BaseModel):
    transactions: list[dict[str, Any]]
    next_cursor: None = None
    unavailable_fields: list[str]
