from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import timedelta
from typing import Any

from .config import settings


class TokenError(ValueError):
    """Raised when an access token is malformed or invalid."""


def create_access_token(
    subject: str,
    role: str,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = int(time.time())
    expires_in = int((expires_delta or timedelta(seconds=settings.access_token_expires_seconds)).total_seconds())
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": "access",
        "iat": now,
        "exp": now + max(expires_in, 1),
    }
    if extra_claims:
        payload.update(extra_claims)
    return _encode_jwt(payload)


def decode_access_token(token: str) -> dict[str, Any]:
    header, payload = _decode_jwt(token)
    if header.get("alg") != settings.JWT_ALGORITHM:
        raise TokenError("unsupported token algorithm")
    if payload.get("type") != "access":
        raise TokenError("invalid token type")
    if not isinstance(payload.get("sub"), str) or not payload["sub"].strip():
        raise TokenError("invalid token subject")
    if not isinstance(payload.get("role"), str) or not payload["role"].strip():
        raise TokenError("invalid token role")
    exp = payload.get("exp")
    if not isinstance(exp, int):
        raise TokenError("invalid token expiration")
    if exp <= int(time.time()):
        raise TokenError("token expired")
    return payload


def _encode_jwt(payload: dict[str, Any]) -> str:
    header = {"alg": settings.JWT_ALGORITHM, "typ": "JWT"}
    header_segment = _b64url_encode(_json_dumps(header))
    payload_segment = _b64url_encode(_json_dumps(payload))
    signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
    signature = _sign(signing_input)
    signature_segment = _b64url_encode(signature)
    return f"{header_segment}.{payload_segment}.{signature_segment}"


def _decode_jwt(token: str) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError as exc:
        raise TokenError("invalid token format") from exc

    signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
    expected_signature = _b64url_encode(_sign(signing_input))
    if not hmac.compare_digest(signature_segment, expected_signature):
        raise TokenError("invalid token signature")

    try:
        header = json.loads(_b64url_decode(header_segment))
        payload = json.loads(_b64url_decode(payload_segment))
    except (json.JSONDecodeError, ValueError) as exc:
        raise TokenError("invalid token payload") from exc

    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise TokenError("invalid token body")
    return header, payload


def _sign(data: bytes) -> bytes:
    return hmac.new(settings.JWT_SECRET.encode("utf-8"), data, hashlib.sha256).digest()


def _json_dumps(data: dict[str, Any]) -> bytes:
    return json.dumps(data, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))
