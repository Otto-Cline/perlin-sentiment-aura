import httpx
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def patch_post(monkeypatch, result):
    async def fake_post(self, url, **kwargs):
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)


def test_returns_token_on_success(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "fake-key")
    patch_post(
        monkeypatch,
        httpx.Response(200, json={"access_token": "jwt-abc", "expires_in": 30.0}),
    )
    res = client.get("/deepgram_token")
    assert res.status_code == 200
    assert res.json() == {"access_token": "jwt-abc", "expires_in": 30.0}


def test_returns_503_when_key_missing(monkeypatch):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    res = client.get("/deepgram_token")
    assert res.status_code == 503


def test_returns_502_when_deepgram_rejects(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "fake-key")
    patch_post(monkeypatch, httpx.Response(401, json={"err_code": "INVALID_AUTH"}))
    res = client.get("/deepgram_token")
    assert res.status_code == 502


def test_returns_502_on_network_failure(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "fake-key")
    patch_post(monkeypatch, httpx.ConnectError("boom"))
    res = client.get("/deepgram_token")
    assert res.status_code == 502


def test_returns_502_on_malformed_success_body(monkeypatch):
    """A 200 without access_token must not become a 500."""
    monkeypatch.setenv("DEEPGRAM_API_KEY", "fake-key")
    patch_post(monkeypatch, httpx.Response(200, json={"unexpected": "shape"}))
    res = client.get("/deepgram_token")
    assert res.status_code == 502


def test_never_leaks_the_api_key_in_the_response(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "super-secret-key")
    patch_post(monkeypatch, httpx.Response(401, text="nope"))
    res = client.get("/deepgram_token")
    assert "super-secret-key" not in res.text
