"""whatsapp_connections.welcome_enabled (işletme karşılama mesajını kapatabilsin)

Revision ID: i7d8e9f0a1b2
Revises: h6c7d8e9f0a1
"""
from alembic import op
import sqlalchemy as sa

revision = "i7d8e9f0a1b2"
down_revision = "h6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("whatsapp_connections", sa.Column("welcome_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("whatsapp_connections", "welcome_enabled")
