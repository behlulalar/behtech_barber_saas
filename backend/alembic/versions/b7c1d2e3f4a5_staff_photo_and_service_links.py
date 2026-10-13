"""staff.photo_image + mevcut tenant'lar için personel-hizmet eşleşmesi

Personel-hizmet kuralı artık katı: berber sadece staff_services'te bağlı olduğu hizmetleri verir.
Hiç eşleşmesi olmayan tenant'larda (ör. demo) herkesin her hizmeti verdiğini varsayıp doldururuz;
eşleşmesi olan tenant'lara (ör. eski sistemden taşınan sefapertev) dokunmayız.

Revision ID: b7c1d2e3f4a5
Revises: a1b2c3d4e5f6
Create Date: 2026-10-13 21:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('staff', sa.Column('photo_image', sa.Text(), nullable=True))
    op.execute(
        """
        INSERT INTO staff_services (tenant_id, staff_id, service_id)
        SELECT s.tenant_id, s.id, v.id
        FROM staff s
        JOIN services v ON v.tenant_id = s.tenant_id
        WHERE s.role <> 'technical_support'
          AND NOT EXISTS (SELECT 1 FROM staff_services ss WHERE ss.tenant_id = s.tenant_id)
        """
    )


def downgrade() -> None:
    op.drop_column('staff', 'photo_image')
