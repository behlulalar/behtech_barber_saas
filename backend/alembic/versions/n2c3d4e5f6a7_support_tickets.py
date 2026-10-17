"""support_tickets: işletmeden platforma destek talepleri

Revision ID: n2c3d4e5f6a7
Revises: m1b2c3d4e5f6
"""
from alembic import op
import sqlalchemy as sa

revision = "n2c3d4e5f6a7"
down_revision = "m1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_id", sa.Integer(), sa.ForeignKey("staff.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("reply", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_support_tickets_status", "support_tickets", ["status", "created_at"])
    op.create_index("idx_support_tickets_tenant", "support_tickets", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("support_tickets")
