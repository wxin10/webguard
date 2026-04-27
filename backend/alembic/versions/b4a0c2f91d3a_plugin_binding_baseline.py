"""plugin binding baseline

Revision ID: b4a0c2f91d3a
Revises: 9c1a4f2d8b7e
Create Date: 2026-04-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "b4a0c2f91d3a"
down_revision = "9c1a4f2d8b7e"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    if not _has_table("plugin_instances"):
        op.create_table(
            "plugin_instances",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("plugin_instance_id", sa.String(length=128), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("display_name", sa.String(length=100), nullable=True),
            sa.Column("browser_family", sa.String(length=50), nullable=True),
            sa.Column("plugin_version", sa.String(length=50), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("bound_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_plugin_instances_id"), "plugin_instances", ["id"], unique=False)
        op.create_index(op.f("ix_plugin_instances_plugin_instance_id"), "plugin_instances", ["plugin_instance_id"], unique=True)
        op.create_index(op.f("ix_plugin_instances_status"), "plugin_instances", ["status"], unique=False)
        op.create_index(op.f("ix_plugin_instances_user_id"), "plugin_instances", ["user_id"], unique=False)

    if not _has_table("plugin_binding_challenges"):
        op.create_table(
            "plugin_binding_challenges",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("challenge_id", sa.String(length=128), nullable=False),
            sa.Column("plugin_instance_id", sa.String(length=128), nullable=False),
            sa.Column("binding_code_hash", sa.String(length=128), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("confirmed_by_user_id", sa.Integer(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_plugin_binding_challenges_challenge_id"), "plugin_binding_challenges", ["challenge_id"], unique=True)
        op.create_index(op.f("ix_plugin_binding_challenges_confirmed_by_user_id"), "plugin_binding_challenges", ["confirmed_by_user_id"], unique=False)
        op.create_index(op.f("ix_plugin_binding_challenges_expires_at"), "plugin_binding_challenges", ["expires_at"], unique=False)
        op.create_index(op.f("ix_plugin_binding_challenges_id"), "plugin_binding_challenges", ["id"], unique=False)
        op.create_index(op.f("ix_plugin_binding_challenges_plugin_instance_id"), "plugin_binding_challenges", ["plugin_instance_id"], unique=False)
        op.create_index(op.f("ix_plugin_binding_challenges_status"), "plugin_binding_challenges", ["status"], unique=False)

    if not _has_table("plugin_refresh_tokens"):
        op.create_table(
            "plugin_refresh_tokens",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("plugin_instance_id", sa.String(length=128), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("rotated_from_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["rotated_from_id"], ["plugin_refresh_tokens.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_plugin_refresh_tokens_expires_at"), "plugin_refresh_tokens", ["expires_at"], unique=False)
        op.create_index(op.f("ix_plugin_refresh_tokens_id"), "plugin_refresh_tokens", ["id"], unique=False)
        op.create_index(op.f("ix_plugin_refresh_tokens_plugin_instance_id"), "plugin_refresh_tokens", ["plugin_instance_id"], unique=False)
        op.create_index(op.f("ix_plugin_refresh_tokens_token_hash"), "plugin_refresh_tokens", ["token_hash"], unique=True)
        op.create_index(op.f("ix_plugin_refresh_tokens_user_id"), "plugin_refresh_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_plugin_refresh_tokens_user_id"), table_name="plugin_refresh_tokens")
    op.drop_index(op.f("ix_plugin_refresh_tokens_token_hash"), table_name="plugin_refresh_tokens")
    op.drop_index(op.f("ix_plugin_refresh_tokens_plugin_instance_id"), table_name="plugin_refresh_tokens")
    op.drop_index(op.f("ix_plugin_refresh_tokens_id"), table_name="plugin_refresh_tokens")
    op.drop_index(op.f("ix_plugin_refresh_tokens_expires_at"), table_name="plugin_refresh_tokens")
    op.drop_table("plugin_refresh_tokens")
    op.drop_index(op.f("ix_plugin_binding_challenges_status"), table_name="plugin_binding_challenges")
    op.drop_index(op.f("ix_plugin_binding_challenges_plugin_instance_id"), table_name="plugin_binding_challenges")
    op.drop_index(op.f("ix_plugin_binding_challenges_id"), table_name="plugin_binding_challenges")
    op.drop_index(op.f("ix_plugin_binding_challenges_expires_at"), table_name="plugin_binding_challenges")
    op.drop_index(op.f("ix_plugin_binding_challenges_confirmed_by_user_id"), table_name="plugin_binding_challenges")
    op.drop_index(op.f("ix_plugin_binding_challenges_challenge_id"), table_name="plugin_binding_challenges")
    op.drop_table("plugin_binding_challenges")
    op.drop_index(op.f("ix_plugin_instances_user_id"), table_name="plugin_instances")
    op.drop_index(op.f("ix_plugin_instances_status"), table_name="plugin_instances")
    op.drop_index(op.f("ix_plugin_instances_plugin_instance_id"), table_name="plugin_instances")
    op.drop_index(op.f("ix_plugin_instances_id"), table_name="plugin_instances")
    op.drop_table("plugin_instances")
