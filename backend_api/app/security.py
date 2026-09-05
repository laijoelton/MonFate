"""Device authentication + payload integrity for the ingestion endpoints.

  1. API key   — X-API-Key header, constant-time compared to the provisioned key.
  2. HMAC-SHA256 — X-Signature over the raw body, toggled by SYS_REQUIRE_HMAC
                   while the firmware side is being brought online.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import Header, HTTPException, Request, status

from .config import get_settings

settings = get_settings()


async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> None:
    if not secrets.compare_digest(x_api_key, settings.API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


async def verify_signature(
    request: Request, x_signature: str | None = Header(None, alias="X-Signature")
) -> None:
    if not settings.REQUIRE_HMAC:
        return
    if not x_signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-Signature")
    body = await request.body()
    expected = hmac.new(settings.HMAC_SHARED_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signature verification failed")
