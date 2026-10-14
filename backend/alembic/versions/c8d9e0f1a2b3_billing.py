"""billing: plans, subscriptions, payments, platform_settings, push_subscriptions, tenants.auto_suspended_at

Revision ID: c8d9e0f1a2b3
Revises: b7c1d2e3f4a5
Create Date: 2026-10-14 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, Sequence[str], None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

REMINDER_TEMPLATE = (
    "Merhaba {sahip}, {isletme} için BehTech Randevu {paket} aboneliğiniz {bitis} tarihinde sona eriyor "
    "({kalan_gun} gün kaldı). Yenileme tutarı {tutar}. Ödemeyi {iban} IBAN'ına ({alici}, {banka}) "
    "açıklamaya işletme adınızı yazarak yapabilirsiniz. Teşekkürler!"
)
OVERDUE_TEMPLATE = (
    "Merhaba {sahip}, {isletme} için BehTech Randevu aboneliğinizin süresi {bitis} tarihinde doldu. "
    "Hizmetinizin kesintiye uğramaması için {kalan_tutar} tutarındaki ödemeyi {iban} IBAN'ına "
    "({alici}, {banka}) yapabilirsiniz. Teşekkürler!"
)


def upgrade() -> None:
    op.add_column('tenants', sa.Column('auto_suspended_at', sa.DateTime(), nullable=True))

    plans = op.create_table(
        'plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('duration_months', sa.Integer(), nullable=False),
        sa.Column('price', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.CheckConstraint('duration_months BETWEEN 1 AND 60', name='ck_plans_duration'),
        sa.CheckConstraint('price >= 0', name='ck_plans_price'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.bulk_insert(plans, [
        {'name': 'Aylık', 'duration_months': 1, 'price': 0, 'sort_order': 1},
        {'name': '6 Aylık', 'duration_months': 6, 'price': 0, 'sort_order': 2},
        {'name': 'Yıllık', 'duration_months': 12, 'price': 0, 'sort_order': 3},
    ])

    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=True),
        sa.Column('plan_name', sa.String(length=100), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('price', sa.Integer(), server_default='0', nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('reminded_at', sa.DateTime(), nullable=True),
        sa.Column('last_notified_on', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.CheckConstraint('end_date >= start_date', name='ck_subscriptions_dates'),
        sa.CheckConstraint('price >= 0', name='ck_subscriptions_price'),
        sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_subscriptions_tenant_id', 'subscriptions', ['tenant_id'])

    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('subscription_id', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('paid_on', sa.Date(), nullable=False),
        sa.Column('method', sa.String(length=50), server_default='IBAN', nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.CheckConstraint('amount > 0', name='ck_payments_amount'),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_payments_tenant_id', 'payments', ['tenant_id'])
    op.create_index('idx_payments_subscription_id', 'payments', ['subscription_id'])
    op.create_index('idx_payments_paid_on', 'payments', ['paid_on'])

    settings_table = op.create_table(
        'platform_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('iban', sa.String(length=34), nullable=True),
        sa.Column('account_holder', sa.String(length=255), nullable=True),
        sa.Column('bank_name', sa.String(length=255), nullable=True),
        sa.Column('reminder_days', sa.Integer(), server_default='3', nullable=False),
        sa.Column('grace_days', sa.Integer(), server_default='7', nullable=False),
        sa.Column('notify_email', sa.String(length=255), nullable=True),
        sa.Column('reminder_template', sa.Text(), nullable=False),
        sa.Column('overdue_template', sa.Text(), nullable=False),
        sa.CheckConstraint('id = 1', name='ck_platform_settings_single_row'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.bulk_insert(settings_table, [
        {'id': 1, 'reminder_days': 3, 'grace_days': 7,
         'reminder_template': REMINDER_TEMPLATE, 'overdue_template': OVERDUE_TEMPLATE},
    ])

    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('platform_admin_id', sa.Integer(), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.String(length=255), nullable=False),
        sa.Column('auth', sa.String(length=255), nullable=False),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['platform_admin_id'], ['platform_admins.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('endpoint'),
    )


def downgrade() -> None:
    op.drop_table('push_subscriptions')
    op.drop_table('platform_settings')
    op.drop_index('idx_payments_paid_on', table_name='payments')
    op.drop_index('idx_payments_subscription_id', table_name='payments')
    op.drop_index('idx_payments_tenant_id', table_name='payments')
    op.drop_table('payments')
    op.drop_index('idx_subscriptions_tenant_id', table_name='subscriptions')
    op.drop_table('subscriptions')
    op.drop_table('plans')
    op.drop_column('tenants', 'auto_suspended_at')
