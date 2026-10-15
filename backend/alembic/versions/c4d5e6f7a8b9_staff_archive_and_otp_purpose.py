"""personel arşivi (is_active, left_at), appointments.staff_id FK -> NO ACTION, verification_codes.purpose

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-10-15 20:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('staff', sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column('staff', sa.Column('left_at', sa.Date(), nullable=True))
    # NO ACTION (RESTRICT değil): tenant silinince zincirleme silme aynı deyimde çalışmaya devam eder,
    # ama personel satırı tek başına silinirse geçmiş randevular sessizce gitmez.
    op.drop_constraint('appointments_staff_id_fkey', 'appointments', type_='foreignkey')
    op.create_foreign_key('appointments_staff_id_fkey', 'appointments', 'staff', ['staff_id'], ['id'], ondelete='NO ACTION')
    op.add_column('verification_codes', sa.Column('purpose', sa.String(length=20), server_default='login', nullable=False))


def downgrade() -> None:
    op.drop_column('verification_codes', 'purpose')
    op.drop_constraint('appointments_staff_id_fkey', 'appointments', type_='foreignkey')
    op.create_foreign_key('appointments_staff_id_fkey', 'appointments', 'staff', ['staff_id'], ['id'], ondelete='CASCADE')
    op.drop_column('staff', 'left_at')
    op.drop_column('staff', 'is_active')
