"""ai provider configs

Revision ID: c7d3e92a41f0
Revises: b4a0c2f91d3a
Create Date: 2026-05-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "c7d3e92a41f0"
down_revision = "b4a0c2f91d3a"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    if _has_table("ai_provider_configs"):
        return
    op.create_table(
        "ai_provider_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("base_url", sa.String(length=512), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=True),
        sa.Column("api_key_masked", sa.String(length=32), nullable=True),
        sa.Column("last_test_status", sa.String(length=50), nullable=True),
        sa.Column("last_test_message", sa.Text(), nullable=True),
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider"),
    )
    op.create_index(op.f("ix_ai_provider_configs_id"), "ai_provider_configs", ["id"], unique=False)
    op.create_index(op.f("ix_ai_provider_configs_provider"), "ai_provider_configs", ["provider"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_provider_configs_provider"), table_name="ai_provider_configs")
    op.drop_index(op.f("ix_ai_provider_configs_id"), table_name="ai_provider_configs")
    op.drop_table("ai_provider_configs")
