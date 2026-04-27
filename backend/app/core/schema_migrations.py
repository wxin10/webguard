from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


RUNTIME_COLUMNS: dict[str, dict[str, str]] = {
    "users": {
        "email": "VARCHAR(255) NULL",
        "password_hash": "VARCHAR(255) NULL",
        "last_login_at": "TIMESTAMP WITH TIME ZONE NULL",
    },
    "scan_records": {
        "user_id": "INTEGER NULL",
        "report_id": "INTEGER NULL",
    },
    "rule_configs": {
        "type": "VARCHAR(50) DEFAULT 'heuristic'",
        "scope": "VARCHAR(20) DEFAULT 'global'",
        "status": "VARCHAR(20) DEFAULT 'active'",
        "version": "VARCHAR(50) DEFAULT 'v1'",
        "pattern": "VARCHAR(255) NULL",
        "content": "TEXT NULL",
        "category": "VARCHAR(50) DEFAULT 'general'",
        "severity": "VARCHAR(20) DEFAULT 'medium'",
    },
    "domain_whitelist": {
        "source": "VARCHAR(50) DEFAULT 'admin'",
        "status": "VARCHAR(20) DEFAULT 'active'",
        "updated_at": "DATETIME NULL",
    },
    "domain_blacklist": {
        "source": "VARCHAR(50) DEFAULT 'admin'",
        "status": "VARCHAR(20) DEFAULT 'active'",
        "updated_at": "DATETIME NULL",
    },
    "plugin_sync_events": {
        "user_id": "INTEGER NULL",
        "host": "VARCHAR(255) NULL",
        "risk_level": "VARCHAR(20) NULL",
        "payload": "JSON NULL",
    },
    "feedback_cases": {
        "user_id": "INTEGER NULL",
        "related_report_id": "INTEGER NULL",
        "related_event_id": "INTEGER NULL",
        "content": "TEXT NULL",
    },
}


def ensure_runtime_schema(engine: Engine) -> None:
    """Add lightweight additive columns needed by the local demo database.

    This does not replace Alembic for production. It keeps the development
    database compatible with the current ORM models because `create_all` does
    not alter existing tables.
    """

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table_name, columns in RUNTIME_COLUMNS.items():
            if table_name not in existing_tables:
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, definition in columns.items():
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))
