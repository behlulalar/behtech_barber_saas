"""platform admin 2fa (totp) + backup codes

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
"""
from alembic import op
import sqlalchemy as sa

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("platform_admins", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column("platform_admins", sa.Column("totp_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("platform_admins", sa.Column("totp_last_step", sa.Integer(), nullable=True))
    op.create_table(
        "platform_backup_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("admin_id", sa.Integer(), sa.ForeignKey("platform_admins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_platform_backup_codes_admin_id", "platform_backup_codes", ["admin_id"])


def downgrade() -> None:
    op.drop_index("ix_platform_backup_codes_admin_id", table_name="platform_backup_codes")
    op.drop_table("platform_backup_codes")
    op.drop_column("platform_admins", "totp_last_step")
    op.drop_column("platform_admins", "totp_enabled")
    op.drop_column("platform_admins", "totp_secret")
