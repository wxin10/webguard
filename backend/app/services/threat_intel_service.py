from __future__ import annotations

import socket
import ssl
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from ..models import DomainBlacklist
from .threat_intel_parser import parse_threat_intel_domains
from .threat_intel_sources import DEFAULT_THREAT_INTEL_SOURCES, ThreatIntelSource


PROTECTED_BLACKLIST_SOURCES = {"admin", "manual", "user", "platform_policy"}
REPLACEABLE_LEGACY_SOURCES = {"auto", "default", "demo", "seed", "rule", "import"}
THREAT_INTEL_SOURCE_PREFIX = "threat_intel:"


class ThreatIntelService:
    def __init__(
        self,
        db: Session,
        sources: Iterable[ThreatIntelSource] | None = None,
        timeout_seconds: int = 20,
    ):
        self.db = db
        self.sources = tuple(sources or DEFAULT_THREAT_INTEL_SOURCES)
        self.timeout_seconds = timeout_seconds

    def sync_sources(
        self,
        replace_existing_threat_intel: bool = True,
        limit_per_source: int | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {
            "replace_existing_threat_intel": replace_existing_threat_intel,
            "dry_run": dry_run,
            "sources": [],
            "total_inserted": 0,
            "total_updated": 0,
            "total_skipped": 0,
            "disabled_old_records": 0,
        }

        if replace_existing_threat_intel and not dry_run:
            result["disabled_old_records"] = self._disable_replaceable_records()

        for source in self.sources:
            if not source.enabled:
                continue
            source_result = self._sync_one_source(source, limit_per_source=limit_per_source, dry_run=dry_run)
            result["sources"].append(source_result)
            result["total_inserted"] += source_result["inserted"]
            result["total_updated"] += source_result["updated"]
            result["total_skipped"] += source_result["skipped"]

        return result

    def fetch_source(self, source: ThreatIntelSource) -> str:
        request = Request(
            source.url,
            headers={
                "User-Agent": "WebGuard-ThreatIntel/1.0",
                "Accept": "text/plain,*/*;q=0.8",
            },
        )
        with urlopen(request, timeout=self.timeout_seconds) as response:
            content = response.read()
        return content.decode("utf-8", errors="replace")

    def _sync_one_source(
        self,
        source: ThreatIntelSource,
        *,
        limit_per_source: int | None,
        dry_run: bool,
    ) -> dict[str, Any]:
        source_result: dict[str, Any] = {
            "source_key": source.source_key,
            "name": source.name,
            "fetched": False,
            "parsed_domains": 0,
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "error": None,
        }
        try:
            text = self.fetch_source(source)
            source_result["fetched"] = True
            domains = sorted(parse_threat_intel_domains(text))
            if limit_per_source is not None:
                domains = domains[: max(0, limit_per_source)]
            source_result["parsed_domains"] = len(domains)
            if not dry_run:
                inserted, updated, skipped = self._upsert_domains(source, domains)
                source_result["inserted"] = inserted
                source_result["updated"] = updated
                source_result["skipped"] = skipped
        except HTTPError as exc:
            self.db.rollback()
            source_result["error"] = self._format_fetch_error(exc)
        except (URLError, TimeoutError, socket.timeout, ssl.SSLError, OSError, ValueError) as exc:
            self.db.rollback()
            source_result["error"] = self._format_fetch_error(exc)
        except Exception as exc:
            self.db.rollback()
            source_result["error"] = f"unexpected error ({type(exc).__name__}): {exc}"
        return source_result

    def _disable_replaceable_records(self) -> int:
        records = (
            self.db.query(DomainBlacklist)
            .filter(DomainBlacklist.status == "active")
            .filter(
                (DomainBlacklist.source.like(f"{THREAT_INTEL_SOURCE_PREFIX}%"))
                | (DomainBlacklist.source.in_(REPLACEABLE_LEGACY_SOURCES))
            )
            .all()
        )
        for record in records:
            record.status = "disabled"
        if records:
            self.db.commit()
        return len(records)

    def _upsert_domains(self, source: ThreatIntelSource, domains: list[str]) -> tuple[int, int, int]:
        inserted = 0
        updated = 0
        skipped = 0
        for domain in domains:
            existing = self.db.query(DomainBlacklist).filter(DomainBlacklist.domain == domain).first()
            if existing is None:
                self.db.add(
                    DomainBlacklist(
                        domain=domain,
                        source=self._source_value(source),
                        risk_type=source.risk_type,
                        reason=self._reason(source),
                        status="active",
                    )
                )
                inserted += 1
                continue

            existing_source = existing.source or ""
            if existing_source in PROTECTED_BLACKLIST_SOURCES:
                skipped += 1
                continue
            if existing_source.startswith(THREAT_INTEL_SOURCE_PREFIX) or existing_source in REPLACEABLE_LEGACY_SOURCES:
                existing.source = self._source_value(source)
                existing.risk_type = source.risk_type
                existing.reason = self._reason(source)
                existing.status = "active"
                updated += 1
                continue
            skipped += 1

        self.db.commit()
        return inserted, updated, skipped

    def _source_value(self, source: ThreatIntelSource) -> str:
        return f"{THREAT_INTEL_SOURCE_PREFIX}{source.source_key}"

    def _reason(self, source: ThreatIntelSource) -> str:
        return f"命中外部恶意网站规则库：{source.name}；风险类型：{source.risk_type}"

    def _format_fetch_error(self, exc: Exception) -> str:
        if isinstance(exc, HTTPError):
            if exc.code in {401, 403, 429}:
                return f"upstream rejected request (HTTP {exc.code}): {exc.reason}"
            if 500 <= exc.code <= 599:
                return f"source unavailable (HTTP {exc.code}): {exc.reason}"
            return f"HTTP error while fetching source (HTTP {exc.code}): {exc.reason}"

        if isinstance(exc, (TimeoutError, socket.timeout)):
            return "timeout while fetching source"

        if isinstance(exc, URLError):
            reason = exc.reason
            if isinstance(reason, ssl.SSLError) or "ssl" in str(reason).lower():
                return f"ssl/network error while fetching source: {reason}"
            return f"network error while fetching source: {reason}"

        if isinstance(exc, ssl.SSLError):
            return f"ssl/network error while fetching source: {exc}"

        if isinstance(exc, OSError):
            message = str(exc)
            lowered = message.lower()
            if "ssl" in lowered or "eof" in lowered or "certificate" in lowered:
                return f"ssl/network error while fetching source: {message}"
            return f"network error while fetching source: {message}"

        if isinstance(exc, ValueError):
            return f"invalid source content: {exc}"

        return f"source unavailable: {exc}"
