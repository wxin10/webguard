from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet

from .config import settings


logger = logging.getLogger(__name__)
_fernet: Fernet | None = None
_warned_derived_key = False


def _resolve_fernet_key() -> bytes:
    global _warned_derived_key
    configured = (settings.SECRET_ENCRYPTION_KEY or "").strip()
    if configured:
        return configured.encode("utf-8")
    if not settings.DEBUG:
        raise RuntimeError("production must configure SECRET_ENCRYPTION_KEY")
    if not _warned_derived_key:
        logger.warning("SECRET_ENCRYPTION_KEY is not configured; deriving a local development encryption key from JWT_SECRET.")
        _warned_derived_key = True
    digest = hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_resolve_fernet_key())
    return _fernet


def encrypt_secret(value: str) -> str:
    return get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    return get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")


def mask_secret(value: str | None) -> str | None:
    secret = (value or "").strip()
    if not secret:
        return None
    if len(secret) <= 7:
        return secret[:3] + "****"
    return secret[:3] + "****" + secret[-4:]
