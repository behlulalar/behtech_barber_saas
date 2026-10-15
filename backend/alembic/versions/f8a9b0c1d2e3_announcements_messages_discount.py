"""announcements, message logs, subscription discount

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
"""
from alembic import op
import sqlalchemy as sa

revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("list_price", sa.Integer(), nullable=True))
    op.add_column("subscriptions", sa.Column("discount_percent", sa.Integer(), server_default="0", nullable=False))
    op.create_check_constraint("ck_subscriptions_discount", "subscriptions", "discount_percent >= 0 AND discount_percent <= 100")
    op.create_table(
        "message_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_message_logs_tenant_created", "message_logs", ["tenant_id", "created_at"])
    op.create_index("idx_message_logs_created", "message_logs", ["created_at"])
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("level", sa.String(10), server_default="info", nullable=False),
        sa.Column("target_all", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "announcement_targets",
        sa.Column("announcement_id", sa.Integer(), sa.ForeignKey("announcements.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("idx_announcement_targets_tenant", "announcement_targets", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_announcement_targets_tenant", table_name="announcement_targets")
    op.drop_table("announcement_targets")
    op.drop_table("announcements")
    op.drop_index("idx_message_logs_created", table_name="message_logs")
    op.drop_index("idx_message_logs_tenant_created", table_name="message_logs")
    op.drop_table("message_logs")
    op.drop_constraint("ck_subscriptions_discount", "subscriptions")
    op.drop_column("subscriptions", "discount_percent")
    op.drop_column("subscriptions", "list_price")
