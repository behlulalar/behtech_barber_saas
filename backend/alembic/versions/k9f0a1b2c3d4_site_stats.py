"""site_stats: tanıtım sitesi günlük sayaçları

Revision ID: k9f0a1b2c3d4
Revises: j8e9f0a1b2c3
"""
from alembic import op
import sqlalchemy as sa

revision = "k9f0a1b2c3d4"
down_revision = "j8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_stats",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("event", sa.String(20), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("site_stats")
