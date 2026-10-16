"""tenant login_token (secret panel login url)

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
"""
import secrets
import string

from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None

ALPHABET = string.ascii_lowercase + string.digits


def upgrade() -> None:
    op.add_column("tenants", sa.Column("login_token", sa.String(24), nullable=True))
    conn = op.get_bind()
    for (tid,) in conn.execute(sa.text("SELECT id FROM tenants")).fetchall():
        token = "".join(secrets.choice(ALPHABET) for _ in range(12))
        conn.execute(sa.text("UPDATE tenants SET login_token = :t WHERE id = :i"), {"t": token, "i": tid})
    op.alter_column("tenants", "login_token", nullable=False)
    op.create_unique_constraint("uq_tenants_login_token", "tenants", ["login_token"])


def downgrade() -> None:
    op.drop_constraint("uq_tenants_login_token", "tenants")
    op.drop_column("tenants", "login_token")
