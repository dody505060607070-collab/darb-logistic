from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Settings:
    bridge_token: str
    source_bearer_token: str
    source_fingerprint: str
    payment_status_map: Mapping[str, str]
    source_timeout_seconds: float = 15.0
    source_attempts: int = 3

    @property
    def source_configured(self) -> bool:
        return bool(self.source_bearer_token and self.source_fingerprint)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        values = os.environ if env is None else env
        return cls(
            bridge_token=values.get("PETROAPP_RAE_BRIDGE_TOKEN", "").strip(),
            source_bearer_token=values.get("PETROAPP_BEARER_TOKEN", "").strip(),
            source_fingerprint=values.get("PETROAPP_FINGERPRINT", "").strip(),
            payment_status_map=_payment_status_map(
                values.get("PETROAPP_PAYMENT_STATUS_MAP", "{}")
            ),
        )


def _payment_status_map(raw: str) -> Mapping[str, str]:
    """Parse exact, case-sensitive source values; never infer their semantics."""
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("PETROAPP_PAYMENT_STATUS_MAP must be a JSON object") from exc
    if not isinstance(value, dict):
        raise ValueError("PETROAPP_PAYMENT_STATUS_MAP must be a JSON object")
    result: dict[str, str] = {}
    for source_value, normalized_state in value.items():
        if not isinstance(source_value, str) or normalized_state not in {
            "completed",
            "cancelled",
        }:
            raise ValueError(
                "Payment status mappings must be string keys mapped to completed or cancelled"
            )
        result[source_value] = normalized_state
    return result
