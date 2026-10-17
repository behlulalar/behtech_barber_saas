"""time_off: optional start_time/end_time (partial-day closures)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
"""
from alembic import op
import sqlalchemy as sa

revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("time_off", sa.Column("start_time", sa.Time(), nullable=True))
    op.add_column("time_off", sa.Column("end_time", sa.Time(), nullable=True))
    op.create_check_constraint("ck_time_off_times_pair", "time_off", "(start_time IS NULL) = (end_time IS NULL)")


def downgrade() -> None:
    op.drop_constraint("ck_time_off_times_pair", "time_off")
    op.drop_column("time_off", "end_time")
    op.drop_column("time_off", "start_time")
