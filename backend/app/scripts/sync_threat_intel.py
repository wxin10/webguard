from __future__ import annotations

import argparse
import json

from app.core.database import SessionLocal
from app.services.threat_intel_service import ThreatIntelService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync external malicious website blocklists into DomainBlacklist.")
    parser.add_argument(
        "--limit-per-source",
        type=int,
        default=None,
        help="Maximum number of parsed domains to import per enabled source.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Download and parse sources without writing to the database.",
    )
    parser.add_argument(
        "--no-replace",
        action="store_true",
        help="Do not disable old threat_intel/default/import records before importing.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    db = SessionLocal()
    try:
        service = ThreatIntelService(db)
        result = service.sync_sources(
            replace_existing_threat_intel=not args.no_replace,
            limit_per_source=args.limit_per_source,
            dry_run=args.dry_run,
        )
    finally:
        db.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))
    failed_sources = [source for source in result["sources"] if source.get("error")]
    if failed_sources:
        print(
            "Some sources failed. This does not block synchronization for other sources. "
            "Check network access or upstream availability before production import."
        )
    if args.dry_run:
        print("Dry run completed: no database writes were performed.")


if __name__ == "__main__":
    main()
