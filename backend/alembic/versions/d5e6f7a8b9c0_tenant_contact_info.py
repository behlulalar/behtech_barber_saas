"""tenant_settings: iletişim telefonu, WhatsApp numarası ve Instagram kullanıcı adı

Dükkân sahibi panelden düzenler; müşteri sitesinde ikonlarla gösterilir. Hepsi isteğe bağlı.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-10-15 22:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenant_settings', sa.Column('contact_phone', sa.String(10), nullable=True))
    op.add_column('tenant_settings', sa.Column('whatsapp_phone', sa.String(10), nullable=True))
    op.add_column('tenant_settings', sa.Column('instagram', sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column('tenant_settings', 'instagram')
    op.drop_column('tenant_settings', 'whatsapp_phone')
    op.drop_column('tenant_settings', 'contact_phone')
