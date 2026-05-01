from urllib.error import HTTPError, URLError

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.database import Base
from app.models import DomainBlacklist
from app.services.threat_intel_service import ThreatIntelService
from app.services.threat_intel_sources import ThreatIntelSource


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


SOURCE_ONE = ThreatIntelSource(
    source_key="source_one",
    name="Source One",
    url="https://example.test/one.txt",
    risk_type="scam",
    description="Test scam source.",
)
SOURCE_TWO = ThreatIntelSource(
    source_key="source_two",
    name="Source Two",
    url="https://example.test/two.txt",
    risk_type="malware",
    description="Test malware source.",
)


class FakeThreatIntelService(ThreatIntelService):
    def __init__(self, db, *, responses, sources=(SOURCE_ONE,)):
        super().__init__(db, sources=sources)
        self.responses = responses

    def fetch_source(self, source):
        response = self.responses[source.source_key]
        if isinstance(response, Exception):
            raise response
        return response


def test_sync_sources_dry_run_does_not_write_database(db):
    service = FakeThreatIntelService(
        db,
        responses={"source_one": "bad.example.com\nanother.example.com\n"},
    )

    result = service.sync_sources(dry_run=True)

    assert result["dry_run"] is True
    assert result["sources"][0]["fetched"] is True
    assert result["sources"][0]["parsed_domains"] == 2
    assert db.query(DomainBlacklist).count() == 0


def test_sync_sources_limit_per_source_writes_domain_blacklist(db):
    service = FakeThreatIntelService(
        db,
        responses={"source_one": "one.example.com\ntwo.example.com\nthree.example.com\n"},
    )

    result = service.sync_sources(limit_per_source=2)

    assert result["total_inserted"] == 2
    records = db.query(DomainBlacklist).order_by(DomainBlacklist.domain).all()
    assert [item.domain for item in records] == ["one.example.com", "three.example.com"]
    assert all(item.source == "threat_intel:source_one" for item in records)
    assert all(item.risk_type == "scam" for item in records)
    assert all(item.status == "active" for item in records)


def test_repeated_sync_does_not_insert_duplicates(db):
    service = FakeThreatIntelService(
        db,
        responses={"source_one": "bad.example.com\nanother.example.com\n"},
    )

    first = service.sync_sources(replace_existing_threat_intel=False)
    second = service.sync_sources(replace_existing_threat_intel=False)

    assert first["total_inserted"] == 2
    assert second["total_inserted"] == 0
    assert second["total_updated"] == 2
    assert db.query(DomainBlacklist).count() == 2


def test_replace_existing_threat_intel_disables_old_records(db):
    db.add(
        DomainBlacklist(
            domain="old.example.com",
            source="threat_intel:old_source",
            risk_type="scam",
            reason="old",
            status="active",
        )
    )
    db.commit()
    service = FakeThreatIntelService(
        db,
        responses={"source_one": "new.example.com\n"},
    )

    result = service.sync_sources(replace_existing_threat_intel=True)

    assert result["disabled_old_records"] == 1
    old_record = db.query(DomainBlacklist).filter(DomainBlacklist.domain == "old.example.com").one()
    assert old_record.status == "disabled"
    assert db.query(DomainBlacklist).filter(DomainBlacklist.domain == "new.example.com").one().status == "active"


def test_sync_does_not_override_manual_or_admin_blacklist(db):
    db.add_all(
        [
            DomainBlacklist(
                domain="manual.example.com",
                source="manual",
                risk_type="admin_policy",
                reason="manual block",
                status="active",
            ),
            DomainBlacklist(
                domain="admin.example.com",
                source="admin",
                risk_type="admin_policy",
                reason="admin block",
                status="active",
            ),
        ]
    )
    db.commit()
    service = FakeThreatIntelService(
        db,
        responses={"source_one": "manual.example.com\nadmin.example.com\nnew.example.com\n"},
    )

    result = service.sync_sources(replace_existing_threat_intel=False)

    assert result["total_inserted"] == 1
    assert result["total_skipped"] == 2
    manual = db.query(DomainBlacklist).filter(DomainBlacklist.domain == "manual.example.com").one()
    admin = db.query(DomainBlacklist).filter(DomainBlacklist.domain == "admin.example.com").one()
    assert manual.source == "manual"
    assert manual.reason == "manual block"
    assert admin.source == "admin"
    assert admin.reason == "admin block"


def test_one_source_download_failure_does_not_stop_other_sources(db):
    service = FakeThreatIntelService(
        db,
        sources=(SOURCE_ONE, SOURCE_TWO),
        responses={
            "source_one": RuntimeError("download failed"),
            "source_two": "good.example.com\n",
        },
    )

    result = service.sync_sources()

    assert result["sources"][0]["error"] is not None
    assert result["sources"][0]["error"].startswith("unexpected error")
    assert result["sources"][1]["error"] is None
    assert result["total_inserted"] == 1
    assert db.query(DomainBlacklist).filter(DomainBlacklist.domain == "good.example.com").count() == 1


def test_source_http_rejection_returns_clear_error(db):
    service = FakeThreatIntelService(
        db,
        responses={
            "source_one": HTTPError(
                "https://example.test/one.txt",
                403,
                "Forbidden",
                hdrs=None,
                fp=None,
            ),
        },
    )

    result = service.sync_sources()

    assert result["sources"][0]["fetched"] is False
    assert result["sources"][0]["parsed_domains"] == 0
    assert result["sources"][0]["error"] == "upstream rejected request (HTTP 403): Forbidden"
    assert result["total_inserted"] == 0


def test_source_network_failure_returns_clear_error_and_continues(db):
    service = FakeThreatIntelService(
        db,
        sources=(SOURCE_ONE, SOURCE_TWO),
        responses={
            "source_one": URLError("temporary DNS failure"),
            "source_two": "good.example.com\n",
        },
    )

    result = service.sync_sources()

    assert result["sources"][0]["error"] == "network error while fetching source: temporary DNS failure"
    assert result["sources"][1]["error"] is None
    assert result["total_inserted"] == 1
    assert db.query(DomainBlacklist).filter(DomainBlacklist.domain == "good.example.com").count() == 1
