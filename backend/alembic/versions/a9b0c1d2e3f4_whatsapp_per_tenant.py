"""per-tenant whatsapp connections

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
"""
from alembic import op
import sqlalchemy as sa

revision = "a9b0c1d2e3f4"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_connections",
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("instance_name", sa.String(60), nullable=False, unique=True),
        sa.Column("state", sa.String(20), server_default="close", nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("profile_name", sa.String(120), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("whatsapp_connections")
