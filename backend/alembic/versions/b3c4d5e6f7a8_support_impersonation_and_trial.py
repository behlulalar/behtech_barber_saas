"""destek girişi (impersonation_codes) ve 14 günlük deneme (is_trial, trial_template)

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-10-15 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TRIAL_TEMPLATE = (
    "Merhaba {sahip}, {isletme} için BehTech Randevu deneme süreniz {bitis} tarihinde sona eriyor "
    "({kalan_gun} gün kaldı). Kullanmaya devam etmek ister misiniz? Devam etmek isterseniz paket "
    "seçeneklerimizi iletelim. Devam etmezseniz deneme bitiminde hesabınız askıya alınır; verileriniz silinmez."
)


def upgrade() -> None:
    op.create_table(
        'impersonation_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('platform_admin_id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('staff_id', sa.Integer(), nullable=False),
        sa.Column('read_only', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['platform_admin_id'], ['platform_admins.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['staff_id'], ['staff.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code_hash'),
    )
    op.create_index('idx_impersonation_codes_tenant_id', 'impersonation_codes', ['tenant_id'])
    op.add_column('subscriptions', sa.Column('is_trial', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('platform_settings', sa.Column('trial_template', sa.Text(), nullable=True))
    settings = sa.table('platform_settings', sa.column('trial_template', sa.Text()))
    op.execute(settings.update().values(trial_template=TRIAL_TEMPLATE))
    op.alter_column('platform_settings', 'trial_template', nullable=False)


def downgrade() -> None:
    op.drop_column('platform_settings', 'trial_template')
    op.drop_column('subscriptions', 'is_trial')
    op.drop_index('idx_impersonation_codes_tenant_id', table_name='impersonation_codes')
    op.drop_table('impersonation_codes')
