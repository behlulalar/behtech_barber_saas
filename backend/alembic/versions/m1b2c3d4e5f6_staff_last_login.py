"""staff.last_login_at: son başarılı giriş (platform son etkinlik göstergesi)

Revision ID: m1b2c3d4e5f6
Revises: l0a1b2c3d4e5
"""
from alembic import op
import sqlalchemy as sa

revision = "m1b2c3d4e5f6"
down_revision = "l0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff", sa.Column("last_login_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("staff", "last_login_at")
