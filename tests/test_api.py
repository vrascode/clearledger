import asyncio
import csv
import io

import pytest
from fastapi.testclient import TestClient

from clearledger.api import RequestBoundary, create_app, from_env
from clearledger.errors import Unavailable
from clearledger.ingest import MAX_BYTES

from .conftest import EXAMPLES

KEY = "test-only-api-key-not-for-deployment-123456"


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "api.sqlite3", KEY)) as client:
        yield client


def imported_ids(client):
    ids = {}
    for kind in ("orders", "transactions", "deposits"):
        response = client.post(
            f"/v1/imports/{kind}",
            params={"batch_key": "sample-v1"},
            headers={"X-API-Key": KEY, "Content-Type": "text/csv"},
            content=(EXAMPLES / f"{kind}.csv").read_bytes(),
        )
        assert response.status_code == 201
        ids[f"{kind}_import_id"] = response.json()["id"]
    return ids


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/v1/imports"),
        ("post", "/v1/imports/orders?batch_key=k"),
        ("get", "/v1/runs"),
        ("post", "/v1/runs"),
        ("get", "/v1/runs/nonexistent"),
        ("get", "/v1/runs/nonexistent/export"),
    ],
)
def test_every_business_endpoint_requires_auth(client, method, path):
    assert getattr(client, method)(path).status_code == 401
    assert getattr(client, method)(path, headers={"X-API-Key": "wrong"}).status_code == 401


def test_full_http_workflow_replay_export_and_restart(client, tmp_path):
    headers = {"X-API-Key": KEY}
    ids = imported_ids(client)
    response = client.post("/v1/runs", json=ids, headers=headers)
    assert response.status_code == 201
    report = response.json()
    assert report["summary"]["exceptions"] == 5
    assert response.headers["cache-control"] == "no-store"
    assert len(response.headers["x-request-id"]) == 32
    replay = client.post("/v1/runs", json=ids, headers=headers)
    assert replay.status_code == 200 and replay.json() == report
    export = client.get(f"/v1/runs/{report['id']}/export", headers=headers)
    assert export.status_code == 200 and "attachment" in export.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(export.text)))
    assert len(rows) == 9
    assert next(row for row in rows if row["reference"] == "PAY-USD-01")["delta_minor"] == "-140"
    with TestClient(create_app(tmp_path / "api.sqlite3", KEY)) as restarted:
        assert restarted.get(f"/v1/runs/{report['id']}", headers=headers).json() == report
        json_export = restarted.get(f"/v1/runs/{report['id']}/export?format=json", headers=headers)
        assert json_export.json() == report


def test_import_replay_conflict_and_atomic_http_rejection(client):
    path = "/v1/imports/orders?batch_key=stable"
    headers = {"X-API-Key": KEY, "Content-Type": "text/csv"}
    data = (EXAMPLES / "orders.csv").read_bytes()
    assert client.post(path, content=data, headers=headers).status_code == 201
    assert client.post(path, content=data, headers=headers).status_code == 200
    assert client.post(path, content=data + b"\n", headers=headers).status_code == 422
    changed = client.post(path, content=data.replace(b"10000", b"10001"), headers=headers)
    assert changed.status_code == 409
    assert len(client.get("/v1/imports", headers=headers).json()["items"]) == 1


def test_limits_content_types_and_schema_do_not_echo_input(client):
    headers = {"X-API-Key": KEY}
    assert (
        client.post("/v1/imports/orders?batch_key=k", content=b"x", headers=headers).status_code
        == 415
    )
    assert (
        client.post("/v1/runs", content=b"x" * (MAX_BYTES + 1), headers=headers).status_code == 413
    )
    assert (
        client.post(
            "/v1/runs", content=b"x", headers={**headers, "Content-Encoding": "gzip"}
        ).status_code
        == 415
    )
    response = client.post("/v1/runs", json={"private_input": "should-not-echo"}, headers=headers)
    assert response.status_code == 422
    assert "should-not-echo" not in response.text
    assert client.get("/v1/runs?limit=101", headers=headers).status_code == 422
    assert client.get("/v1/imports?offset=-1", headers=headers).status_code == 422
    assert client.get("/v1/runs/absent", headers=headers).status_code == 404


def test_pagination(client):
    imported_ids(client)
    headers = {"X-API-Key": KEY}
    first = client.get("/v1/imports?limit=1&offset=0", headers=headers).json()["items"]
    second = client.get("/v1/imports?limit=1&offset=1", headers=headers).json()["items"]
    assert len(first) == len(second) == 1 and first[0]["id"] != second[0]["id"]


def test_health_schema_and_storage_error(client, monkeypatch):
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").json() == {"status": "ready"}
    schema = client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["APIKeyHeader"]["name"] == "X-API-Key"
    assert client.get("/docs").status_code == 200

    def unavailable():
        raise Unavailable("Database operation unavailable; retry later")

    monkeypatch.setattr(client.app.state.store, "health", unavailable)
    assert client.get("/readyz").status_code == 503


@pytest.mark.parametrize("key", ["", "short", " " * 40, "é" * 40, "a" * 257, "a" * 32 + "\n"])
def test_server_refuses_missing_or_invalid_secret(tmp_path, key):
    with pytest.raises(ValueError):
        create_app(tmp_path / "invalid.sqlite3", key)
    assert not (tmp_path / "invalid.sqlite3").exists()


def test_env_factory(monkeypatch, tmp_path):
    monkeypatch.setenv("CLEARLEDGER_API_KEY", KEY)
    monkeypatch.setenv("CLEARLEDGER_DB", str(tmp_path / "env.sqlite3"))
    with TestClient(from_env()) as client:
        assert client.get("/readyz").status_code == 200


@pytest.mark.parametrize(
    "headers,chunks,status",
    [
        ([], [b"123", b"456"], 413),
        ([(b"content-length", b"1")], [b"123456"], 413),
        ([(b"content-length", b"nonsense")], [b""], 400),
        ([(b"content-length", b"-1")], [b""], 400),
        ([(b"content-length", b"6")], [b""], 413),
    ],
)
def test_stream_limit_cannot_be_bypassed(headers, chunks, status):
    async def exercise():
        sent = []
        messages = [
            {"type": "http.request", "body": chunk, "more_body": i < len(chunks) - 1}
            for i, chunk in enumerate(chunks)
        ]

        async def receive():
            return messages.pop(0)

        async def send(message):
            sent.append(message)

        async def unreachable(*_):
            raise AssertionError("Rejected body reached application")

        await RequestBoundary(unreachable, max_bytes=5)(
            {"type": "http", "headers": headers}, receive, send
        )
        assert sent[0]["status"] == status

    asyncio.run(exercise())
