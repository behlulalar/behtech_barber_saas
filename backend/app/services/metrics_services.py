"""Platform Genel Bakış: gelir (MRR/ARR) ve kullanım metrikleri. Faturalama durumunu billing_services'ten alır."""
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.schemas.platform import (
    AtRiskItem,
    ChurnItem,
    MetricsOverview,
    MonthRevenue,
    PlanSlice,
    RenewalItem,
    UsageItem,
)
from app.services import billing_services as billing

YOUNG_TENANT_DAYS = 14
INACTIVE_DAYS = 30
DROP_MIN_PREV = 10


def monthly_value(sub: Subscription, plans: dict[int, Plan]) -> float:
    """Dönemin aylık değeri: fiyat ÷ ay sayısı (paket varsa paketin süresi, yoksa gün sayısından türetilir)."""
    plan = plans.get(sub.plan_id) if sub.plan_id else None
    if plan is not None:
        months = plan.duration_months
    else:
        months = max(1, round(((sub.end_date - sub.start_date).days + 1) / 30.44))
    return sub.price / months


def _month_keys(today: date, n: int = 12) -> list[str]:
    total = today.year * 12 + today.month - 1
    return [f"{(total - i) // 12:04d}-{(total - i) % 12 + 1:02d}" for i in range(n - 1, -1, -1)]


async def overview(db: AsyncSession) -> MetricsOverview:
    today = date.today()
    billings = await billing._build_tenant_billings(db)
    plans = {p.id: p for p in (await db.execute(select(Plan))).scalars()}

    # ---- MRR / plan dağılımı (şu anki ücretli dönem bugünü kapsayan işletmeler; deneme hariç)
    mrr_total = 0.0
    paying = trials = 0
    dist: dict[str, list] = {}
    renewals: list[RenewalItem] = []
    churned: list[ChurnItem] = []
    latest_trial: dict[int, bool] = {}
    for tenant, tb, state in billings:
        if state.status == "trial":
            trials += 1
        cur = state.current
        if cur is not None and not cur.is_trial and cur.price > 0:
            value = monthly_value(cur, plans)
            mrr_total += value
            paying += 1
            slot = dist.setdefault(cur.plan_name, [0, 0.0])
            slot[0] += 1
            slot[1] += value
        if tenant.is_active and state.coverage_end is not None and 0 <= (state.coverage_end - today).days <= 30:
            amount = tb.outstanding if tb.outstanding > 0 else (tb.renewal_price or 0)
            renewals.append(RenewalItem(
                tenant_id=tenant.id, tenant_name=tenant.name, slug=tenant.slug, end_date=state.coverage_end,
                days_left=(state.coverage_end - today).days, amount_due=amount, is_trial=state.is_trial,
            ))
        if (
            not tenant.is_active and tenant.auto_suspended_at is not None
            and tenant.auto_suspended_at >= datetime.now() - timedelta(days=30)
        ):
            churned.append(ChurnItem(
                tenant_id=tenant.id, tenant_name=tenant.name,
                reason="deneme bitti" if state.is_trial else "askıya alındı",
            ))
    renewals.sort(key=lambda r: (r.end_date, r.tenant_name))
    mrr = round(mrr_total)
    plan_distribution = sorted(
        (PlanSlice(plan_name=n, tenants=c, mrr=round(v)) for n, (c, v) in dist.items()),
        key=lambda p: (-p.mrr, p.plan_name),
    )

    # ---- tahsilat: son 12 ay (sıfır dolgulu) + bu ay
    keys = _month_keys(today)
    first = date(int(keys[0][:4]), int(keys[0][5:]), 1)
    month_expr = func.to_char(Payment.paid_on, "YYYY-MM")
    rows = (await db.execute(
        select(month_expr, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.paid_on >= first, Payment.paid_on <= today).group_by(month_expr)
    )).all()
    by_month = {k: int(v) for k, v in rows}
    monthly_revenue = [MonthRevenue(month=k, revenue=by_month.get(k, 0)) for k in keys]

    # ---- kullanım: tek gruplu sorgu (iptal edilmeyen, bugüne kadarki randevular)
    cur_from, prev_from = today - timedelta(days=29), today - timedelta(days=59)
    in_cur = Appointment.appointment_date >= cur_from
    in_prev = (Appointment.appointment_date >= prev_from) & (Appointment.appointment_date < cur_from)
    usage_rows = (await db.execute(
        select(
            Appointment.tenant_id,
            func.count(Appointment.id).filter(in_cur),
            func.count(Appointment.id).filter(in_prev),
            func.max(Appointment.appointment_date),
        )
        .where(Appointment.status != AppointmentStatus.CANCELLED, Appointment.appointment_date <= today)
        .group_by(Appointment.tenant_id)
    )).all()
    usage = {tid: (c, p, last) for tid, c, p, last in usage_rows}

    at_risk: list[AtRiskItem] = []
    top: list[UsageItem] = []
    for tenant, _tb, _state in billings:
        c, p, last = usage.get(tenant.id, (0, 0, None))
        if c > 0:
            top.append(UsageItem(tenant_id=tenant.id, tenant_name=tenant.name, appointments_30d=c))
        created = tenant.created_at.date() if tenant.created_at else today
        if not tenant.is_active or (today - created).days < YOUNG_TENANT_DAYS:
            continue
        days_since = (today - last).days if last else (today - created).days
        reason = None
        if last is None or days_since >= INACTIVE_DAYS:
            reason = "30+ gündür randevu yok"
        elif p >= DROP_MIN_PREV and c < p * 0.5:
            reason = f"Randevular %{round((1 - c / p) * 100)} düştü"
        if reason:
            at_risk.append(AtRiskItem(
                tenant_id=tenant.id, tenant_name=tenant.name, slug=tenant.slug, last_appointment_date=last,
                days_since=days_since, appointments_30d=c, appointments_prev_30d=p, reason=reason,
            ))
    at_risk.sort(key=lambda a: (-a.days_since, a.tenant_name))
    top.sort(key=lambda u: (-u.appointments_30d, u.tenant_name))

    return MetricsOverview(
        mrr=mrr, arr=mrr * 12, paying_tenants=paying, trial_tenants=trials,
        month_collected=by_month.get(keys[-1], 0),
        plan_distribution=plan_distribution, renewals_next_30=renewals, monthly_revenue=monthly_revenue,
        churned_last_30=churned, at_risk=at_risk, top_usage=top[:5],
    )
