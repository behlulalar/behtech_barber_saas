"""randevular artık onay beklemez: mevcut 'pending' randevular 'confirmed' olur

Enum değeri 'pending' veritabanı tipinde bırakıldı (PostgreSQL enum'dan değer silmek zahmetli ve
gereksiz); sadece artık hiçbir yerde üretilmiyor.

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-10-14 17:00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'e0f1a2b3c4d5'
down_revision: Union[str, Sequence[str], None] = 'd9e0f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE appointments SET status = 'confirmed' WHERE status = 'pending'")


def downgrade() -> None:
    # Hangi randevunun eskiden beklemede olduğu bilinmiyor; geri dönüş yok.
    pass
