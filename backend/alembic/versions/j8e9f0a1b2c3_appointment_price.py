"""appointments.price: randevu anındaki fiyat (hizmet fiyatı değişince geçmiş rapor değişmesin)

Revision ID: j8e9f0a1b2c3
Revises: i7d8e9f0a1b2
"""
from alembic import op
import sqlalchemy as sa

revision = "j8e9f0a1b2c3"
down_revision = "i7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("appointments", sa.Column("price", sa.Integer(), nullable=True))
    # Mevcut randevular için en iyi tahmin: hizmetin şu anki fiyatı (tarihsel doğruluk yok; bundan sonrası doğru).
    op.execute("UPDATE appointments a SET price = s.price FROM services s WHERE s.id = a.service_id")


def downgrade() -> None:
    op.drop_column("appointments", "price")
