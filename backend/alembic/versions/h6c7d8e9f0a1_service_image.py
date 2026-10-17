"""services.image (optional service photo as data URL)

Revision ID: h6c7d8e9f0a1
Revises: g5b6c7d8e9f0
"""
from alembic import op
import sqlalchemy as sa

revision = "h6c7d8e9f0a1"
down_revision = "g5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("services", sa.Column("image", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("services", "image")
