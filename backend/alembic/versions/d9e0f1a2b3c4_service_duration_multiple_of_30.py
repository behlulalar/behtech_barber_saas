"""service duration_min rounded up to a multiple of 30 (30-minute slot system)

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-10-14 12:00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd9e0f1a2b3c4'
down_revision: Union[str, Sequence[str], None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 20 -> 30, 40 -> 60, 45 -> 60, 90 -> 90; en az 30.
    op.execute(
        "UPDATE services SET duration_min = GREATEST(30, CEIL(duration_min / 30.0)::int * 30) "
        "WHERE duration_min % 30 <> 0 OR duration_min < 30"
    )


def downgrade() -> None:
    # Eski süreler geri getirilemez (veri kaybı); işlem yok.
    pass
