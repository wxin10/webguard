"""web auth refresh tokens

Revision ID: 9c1a4f2d8b7e
Revises: 442b783e2edf
Create Date: 2026-04-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "9c1a4f2d8b7e"
down_revision = "442b783e2edf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "password_hash" not in user_columns:
        op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    if "last_login_at" not in user_columns:
        op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))

    if "refresh_tokens" not in inspector.get_table_names():
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("user_agent", sa.String(length=255), nullable=True),
            sa.Column("ip_address", sa.String(length=45), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("rotated_from_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["rotated_from_id"], ["refresh_tokens.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_refresh_tokens_expires_at"), "refresh_tokens", ["expires_at"], unique=False)
        op.create_index(op.f("ix_refresh_tokens_id"), "refresh_tokens", ["id"], unique=False)
        op.create_index(op.f("ix_refresh_tokens_session_id"), "refresh_tokens", ["session_id"], unique=True)
        op.create_index(op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"], unique=True)
        op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "refresh_tokens" in inspector.get_table_names():
        op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
        op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
        op.drop_index(op.f("ix_refresh_tokens_session_id"), table_name="refresh_tokens")
        op.drop_index(op.f("ix_refresh_tokens_id"), table_name="refresh_tokens")
        op.drop_index(op.f("ix_refresh_tokens_expires_at"), table_name="refresh_tokens")
        op.drop_table("refresh_tokens")
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "last_login_at" in user_columns:
        op.drop_column("users", "last_login_at")
    if "password_hash" in user_columns:
        op.drop_column("users", "password_hash")
