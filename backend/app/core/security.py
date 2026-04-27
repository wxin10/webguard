from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import timedelta
from typing import Any

from .config import settings


class TokenError(ValueError):
    """Raised when an access token is malformed or invalid."""


PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    clean_password = password or ""
    if not clean_password:
        raise ValueError("password is required")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        clean_password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return "$".join(
        [
            PASSWORD_HASH_ALGORITHM,
            str(PASSWORD_HASH_ITERATIONS),
            _b64url_encode(salt),
            _b64url_encode(digest),
        ]
    )


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password or not password_hash:
        return False
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = password_hash.split("$", 3)
        iterations = int(iterations_raw)
    except (ValueError, AttributeError):
        return False
    if algorithm != PASSWORD_HASH_ALGORITHM or iterations < 1:
        return False
    try:
        salt = _b64url_decode(salt_raw)
        expected_digest = _b64url_decode(digest_raw)
    except ValueError:
        return False
    candidate_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate_digest, expected_digest)


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hmac.new(settings.JWT_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_session_id() -> str:
    return f"websess_{secrets.token_urlsafe(24)}"


def generate_plugin_challenge_id() -> str:
    return f"bind_chal_{secrets.token_urlsafe(18)}"


def generate_binding_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_binding_code(challenge_id: str, binding_code: str) -> str:
    message = f"{challenge_id}:{binding_code}".encode("utf-8")
    return hmac.new(settings.JWT_SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()


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
