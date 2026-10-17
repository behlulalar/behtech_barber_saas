"""error_events: işlenmemiş sunucu hataları (platform Sistem sayfası sayacı)

Revision ID: l0a1b2c3d4e5
Revises: k9f0a1b2c3d4
"""
from alembic import op
import sqlalchemy as sa

revision = "l0a1b2c3d4e5"
down_revision = "k9f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "error_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("method", sa.String(8), nullable=False),
        sa.Column("path", sa.String(200), nullable=False),
        sa.Column("error", sa.String(200), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False, server_default="500"),
    )
    op.create_index("idx_error_events_at", "error_events", ["at"])


def downgrade() -> None:
    op.drop_index("idx_error_events_at", table_name="error_events")
    op.drop_table("error_events")
