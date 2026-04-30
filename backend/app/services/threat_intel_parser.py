from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse


DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)


def parse_threat_intel_domains(text: str) -> set[str]:
    domains: set[str] = set()
    for raw_line in text.splitlines():
        candidate = _extract_domain_candidate(raw_line)
        normalized = normalize_threat_intel_domain(candidate)
        if normalized:
            domains.add(normalized)
    return domains


def normalize_threat_intel_domain(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip().lower().strip(".")
    if not candidate or "*" in candidate:
        return None

    candidate = _strip_adblock_suffix(candidate)
    parsed = urlparse(candidate if "://" in candidate else f"http://{candidate}")
    host = parsed.hostname or candidate.split("/", 1)[0]
    host = host.strip().lower().strip(".")
    if host.startswith("www."):
        host = host[4:]

    if not host or host == "localhost" or _is_ip_address(host):
        return None
    if not DOMAIN_RE.fullmatch(host):
        return None
    return host


def _extract_domain_candidate(raw_line: str) -> str | None:
    line = raw_line.strip()
    if not line:
        return None
    if line.startswith(("!", "#", "@@")):
        return None
    if line.startswith("[") and line.endswith("]"):
        return None
    if line.startswith("/") and line.count("/") >= 2:
        return None
    if "*" in line:
        return None

    if line.startswith("||"):
        return _extract_adblock_domain(line)

    tokens = line.split()
    if len(tokens) >= 2 and _is_ip_address(tokens[0]):
        return tokens[1]

    token = tokens[0] if tokens else line
    if token.startswith(("http://", "https://")):
        return token
    if "/" in token:
        return token
    return token


def _extract_adblock_domain(line: str) -> str | None:
    body = line[2:]
    for separator in ("^", "$", "/"):
        if separator in body:
            body = body.split(separator, 1)[0]
    return body


def _strip_adblock_suffix(value: str) -> str:
    candidate = value
    if candidate.startswith("||"):
        candidate = candidate[2:]
    for separator in ("^", "$"):
        if separator in candidate:
            candidate = candidate.split(separator, 1)[0]
    return candidate


def _is_ip_address(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False
