from typing import Any

from sqlalchemy.orm import Session

from .detector import Detector


class ScanService:
    def __init__(self, db: Session):
        self.detector = Detector(db)

    def scan_url(self, url: str, *, username: str, source: str = "manual") -> dict[str, Any]:
        return self.detector.detect_url(url, source=source, username=username)

    def scan_page(self, page_data: dict[str, Any], *, username: str, source: str = "plugin") -> dict[str, Any]:
        return self.detector.detect_page(page_data, source=source, username=username)
