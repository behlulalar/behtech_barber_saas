"""whatsapp ban protection: connection guard fields, outbound queue

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
"""
from alembic import op
import sqlalchemy as sa

revision = "b0c1d2e3f4a5"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None

COLS = [
    sa.Column("paused", sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column("paused_reason", sa.String(200), nullable=True),
    sa.Column("paused_at", sa.DateTime(), nullable=True),
    sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False),
    sa.Column("last_sent_at", sa.DateTime(), nullable=True),
    sa.Column("disconnect_reason", sa.String(60), nullable=True),
    sa.Column("disconnected_at", sa.DateTime(), nullable=True),
    sa.Column("abuse_alerted_at", sa.DateTime(), nullable=True),
]


def upgrade() -> None:
    for c in COLS:
        op.add_column("whatsapp_connections", c)
    op.add_column("message_logs", sa.Column("ip", sa.String(64), nullable=True))
    op.create_index("idx_message_logs_ip", "message_logs", ["ip", "created_at"])
    op.create_table(
        "outbound_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("to_phone", sa.String(20), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(12), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("not_before", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("error", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_outbound_pending", "outbound_messages", ["status", "not_before"])
    op.create_index("idx_outbound_tenant", "outbound_messages", ["tenant_id", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_outbound_tenant", table_name="outbound_messages")
    op.drop_index("idx_outbound_pending", table_name="outbound_messages")
    op.drop_table("outbound_messages")
    op.drop_index("idx_message_logs_ip", table_name="message_logs")
    op.drop_column("message_logs", "ip")
    for c in reversed(COLS):
        op.drop_column("whatsapp_connections", c.name)
