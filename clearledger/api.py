import os
import secrets
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from . import __version__
from .errors import LedgerError
from .export import export_report
from .ingest import MAX_BYTES
from .store import Store

ImportId = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    orders_import_id: ImportId
    transactions_import_id: ImportId
    deposits_import_id: ImportId


class RequestBoundary:
    """Bound content before JSON/CSV parsing, even without Content-Length."""

    def __init__(self, app, max_bytes=MAX_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request_id = uuid4().hex

        async def send_safe(message):
            if message["type"] == "http.response.start":
                message = dict(message)
                message["headers"] = list(message.get("headers", [])) + [
                    (b"x-request-id", request_id.encode()),
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ]
            await send(message)

        async def reject(status, message):
            response = JSONResponse(
                {"error": {"code": "request_rejected", "message": message}}, status_code=status
            )
            await response(scope, receive, send_safe)

        headers = dict(scope["headers"])
        if headers.get(b"content-encoding", b"identity") != b"identity":
            return await reject(415, "Compressed request bodies are not supported")
        if b"content-length" in headers:
            try:
                length = int(headers[b"content-length"])
            except ValueError:
                return await reject(400, "Invalid Content-Length")
            if length < 0:
                return await reject(400, "Invalid Content-Length")
            if length > self.max_bytes:
                return await reject(413, "Request body too large")
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                return await reject(413, "Request body too large")
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        delivered = False

        async def receive_body():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, receive_body, send_safe)


def create_app(db_path: str | Path, api_key: str) -> FastAPI:
    if not 32 <= len(api_key) <= 256 or any(not 33 <= ord(char) <= 126 for char in api_key):
        raise ValueError(
            "CLEARLEDGER_API_KEY must contain 32-256 printable non-space ASCII characters"
        )
    secret = api_key.encode()
    store = Store(db_path)
    app = FastAPI(
        title="ClearLedger",
        version=__version__,
        description=(
            "Import normalized CSV snapshots, reconcile orders and payout deposits, "
            "and export immutable reports. Amounts are integer minor units."
        ),
        redoc_url=None,
        swagger_ui_parameters={"persistAuthorization": False},
    )
    app.state.store = store
    app.add_middleware(RequestBoundary)
    key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

    def authorize(value: Annotated[str | None, Depends(key_header)]):
        if value is None or not secrets.compare_digest(value.encode("utf-8"), secret):
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

    @app.exception_handler(LedgerError)
    async def ledger_error(_request: Request, error: LedgerError):
        return JSONResponse(
            {"error": {"code": error.code, "message": str(error)}}, status_code=error.status
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _error: RequestValidationError):
        return JSONResponse(
            {"error": {"code": "invalid_request", "message": "Request does not match the schema"}},
            status_code=422,
        )

    @app.get("/healthz", tags=["Operations"])
    def health():
        return {"status": "ok"}

    @app.get("/readyz", tags=["Operations"])
    def ready():
        store.health()
        return {"status": "ready"}

    router = APIRouter(prefix="/v1", dependencies=[Depends(authorize)])

    @router.post(
        "/imports/{kind}",
        tags=["Imports"],
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {
                    "text/csv": {
                        "schema": {"type": "string"},
                        "example": (
                            "order_id,currency,expected_gross_minor,expected_refund_minor\n"
                            "O1,BRL,10000,0\n"
                        ),
                    }
                },
            }
        },
    )
    async def import_csv(
        kind: Literal["orders", "transactions", "deposits"],
        request: Request,
        response: Response,
        batch_key: Annotated[str, Query(min_length=1, max_length=80)],
    ):
        """Send raw UTF-8 CSV with Content-Type: text/csv; replay returns 200."""
        if request.headers.get("content-type", "").split(";")[0].lower() != "text/csv":
            raise HTTPException(status_code=415, detail="Expected Content-Type: text/csv")
        data = await request.body()
        result, created = await run_in_threadpool(store.import_csv, kind, data, batch_key)
        response.status_code = 201 if created else 200
        return result

    @router.get("/imports", tags=["Imports"])
    def imports(
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        return {"items": store.list_imports(limit, offset), "limit": limit, "offset": offset}

    @router.post("/runs", tags=["Reconciliation"])
    def run(body: RunRequest, response: Response):
        """Reconcile exactly three snapshots. Replaying the selection returns the same run."""
        result, created = store.create_run(
            body.orders_import_id, body.transactions_import_id, body.deposits_import_id
        )
        response.status_code = 201 if created else 200
        return result

    @router.get("/runs", tags=["Reconciliation"])
    def runs(
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        return {"items": store.list_runs(limit, offset), "limit": limit, "offset": offset}

    @router.get("/runs/{run_id}", tags=["Reconciliation"])
    def get_run(run_id: str):
        return store.get_run(run_id)

    @router.get("/runs/{run_id}/export", tags=["Reconciliation"])
    def export(run_id: str, format: Literal["csv", "json"] = "csv"):
        report = store.get_run(run_id)
        return Response(
            export_report(report, format),
            media_type="text/csv" if format == "csv" else "application/json",
            headers={"Content-Disposition": f'attachment; filename="reconciliation.{format}"'},
        )

    app.include_router(router)
    return app


def from_env() -> FastAPI:
    key = os.environ.get("CLEARLEDGER_API_KEY", "")
    return create_app(os.environ.get("CLEARLEDGER_DB", ".runtime/clearledger.sqlite3"), key)
