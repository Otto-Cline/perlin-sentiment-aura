"""Mints short-lived Deepgram tokens so the API key never reaches the browser.

Endpoint: POST https://api.deepgram.com/v1/auth/grant
  header  Authorization: Token <API_KEY>
  body    {"ttl_seconds": N}
  returns {"access_token": str, "expires_in": number}

The token only has to be valid for the WebSocket handshake — the socket stays
open afterward — so a short TTL is not a constraint on recording length.
"""

import logging
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

log = logging.getLogger(__name__)

GRANT_URL = "https://api.deepgram.com/v1/auth/grant"

# Ample headroom over the 30s default, purely for the handshake.
TTL_SECONDS = 60

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    expires_in: float


@router.get("/deepgram_token", response_model=TokenResponse)
async def deepgram_token() -> TokenResponse:
    api_key = os.environ.get("DEEPGRAM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Transcription not configured")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(
                GRANT_URL,
                headers={
                    "Authorization": f"Token {api_key}",
                    "Content-Type": "application/json",
                },
                json={"ttl_seconds": TTL_SECONDS},
            )
    except httpx.HTTPError as exc:
        log.warning("Deepgram token request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not reach Deepgram")

    if res.status_code != 200:
        # Deliberately does not forward Deepgram's body — it can echo the key.
        log.warning("Deepgram rejected token request: %s", res.status_code)
        raise HTTPException(status_code=502, detail="Deepgram rejected the request")

    try:
        data = res.json()
        return TokenResponse(
            access_token=data["access_token"],
            expires_in=float(data.get("expires_in", TTL_SECONDS)),
        )
    except (ValueError, KeyError, TypeError) as exc:
        log.error("Unexpected Deepgram token response shape: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Unexpected Deepgram response")
