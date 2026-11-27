from __future__ import annotations


class BridgeError(Exception):
    """Safe bridge error; details never contain source payloads or credentials."""

    def __init__(self, status_code: int, error: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error = error
        self.message = message


class SourceDataError(BridgeError):
    def __init__(self) -> None:
        super().__init__(
            502,
            "source_data",
            "The source response did not match the captured bills schema",
        )
