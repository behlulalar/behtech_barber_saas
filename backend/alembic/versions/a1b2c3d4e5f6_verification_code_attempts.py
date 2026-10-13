"""verification_codes.attempts (OTP brute force sınırı)

Revision ID: a1b2c3d4e5f6
Revises: 6c55001df0cc
Create Date: 2026-10-13 20:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '6c55001df0cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('verification_codes', sa.Column('attempts', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('verification_codes', 'attempts')
