"""outbound message ttl/appointment link, welcome contacts

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""
from alembic import op
import sqlalchemy as sa

revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("outbound_messages", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column("outbound_messages", sa.Column("appointment_id", sa.Integer(), nullable=True))
    op.alter_column("outbound_messages", "to_phone", type_=sa.String(40), existing_nullable=True)
    op.create_table(
        "welcome_contacts",
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("contact_hash", sa.String(64), primary_key=True),
        sa.Column("last_sent_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("welcome_contacts")
    op.alter_column("outbound_messages", "to_phone", type_=sa.String(20), existing_nullable=True)
    op.drop_column("outbound_messages", "appointment_id")
    op.drop_column("outbound_messages", "expires_at")
