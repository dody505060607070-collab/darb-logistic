from __future__ import annotations

import secrets
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings
from .errors import BridgeError
from .models import BillsPage, BillsWindow
from .normalize import normalize_bills
from .source import PetroAppBillsClient

bearer = HTTPBearer(auto_error=False)


def create_app(
    settings: Settings | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Darb PetroApp RAE Bridge",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings or Settings.from_env()
    app.state.source_transport = transport

    @app.exception_handler(BridgeError)
    async def bridge_error_handler(_request: Request, exc: BridgeError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.error, "message": exc.message},
        )

    async def authorize(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> None:
        configured: Settings = request.app.state.settings
        if not configured.bridge_token:
            raise BridgeError(
                503, "missing_bridge_config", "Bridge authentication is not configured"
            )
        supplied = credentials.credentials if credentials is not None else ""
        if (
            credentials is None
            or credentials.scheme.lower() != "bearer"
            or not secrets.compare_digest(supplied, configured.bridge_token)
        ):
            raise BridgeError(401, "unauthorized", "Valid bridge authentication is required")

    def source_client(request: Request) -> PetroAppBillsClient:
        return PetroAppBillsClient(
            request.app.state.settings,
            transport=request.app.state.source_transport,
        )

    @app.get("/health", dependencies=[Depends(authorize)])
    async def health(request: Request) -> dict[str, bool]:
        await source_client(request).health()
        return {"ok": True}

    @app.post(
        "/v1/petroapp/preview",
        dependencies=[Depends(authorize)],
        response_model=BillsPage,
    )
    async def preview(request: Request, window: BillsWindow) -> BillsPage:
        rows = await source_client(request).fetch_bills(window)
        return normalize_bills(rows, request.app.state.settings.payment_status_map)

    @app.post(
        "/v1/petroapp/sync",
        dependencies=[Depends(authorize)],
        response_model=BillsPage,
    )
    async def sync(request: Request, window: BillsWindow) -> BillsPage:
        # This route only returns normalized data. Darb alone stages it for explicit review.
        rows = await source_client(request).fetch_bills(window)
        return normalize_bills(rows, request.app.state.settings.payment_status_map)

    return app


app = create_app()
