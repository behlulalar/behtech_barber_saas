"""Abonelik/ödeme takibi iş mantığı. Durum hesabı compute_state() TEK yerde yapılır; API ve günlük görev kullanır."""
import calendar
import html
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment
from app.models.plan import Plan
from app.models.platform_settings import PlatformSettings
from app.models.push_subscription import PushSubscription
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from app.schemas.billing import (
    BillingOverview,
    BillingStats,
    PaymentCreate,
    PaymentOut,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    PlatformSettingsOut,
    PlatformSettingsUpdate,
    PushSubscribeIn,
    RunChecksResult,
    SubscriptionCreate,
    SubscriptionOut,
    SubscriptionUpdate,
    SuggestOut,
    TenantBilling,
)
from app.services import notify_services, platform_services

logger = logging.getLogger(__name__)

OVERLAP_MSG = "Bu tarihler başka bir dönemle çakışıyor"
COVERED_STATUSES = {"active", "due_soon", "scheduled"}
ATTENTION_ORDER = {"expired": 0, "grace": 1, "due_soon": 2}
IBAN_RE = re.compile(r"^TR\d{24}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- tarih / format yardımcıları ----------

def add_months(d: date, months: int) -> date:
    """Ay ekler; gün sayısı hedef ayın son gününe kırpılır (31 Oca + 1 ay = 28/29 Şub)."""
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    month += 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def period_end(start: date, months: int) -> date:
    """Dönemin son günü (dahil). Normalde bir sonraki ayın aynı gününden bir önceki gün
    (14 Eki → 13 Kas). Hedef ayda o gün yoksa (31 Oca + 1 ay) ay sonuna kırpılır ve o gün
    döneme dahil edilir (→ 28 Şub); aksi halde müşteri bir gün kaybederdi."""
    target = add_months(start, months)
    clamped = target.day < start.day
    return target if clamped else target - timedelta(days=1)


def fmt_date(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def fmt_money(n: int) -> str:
    return f"{n:,}".replace(",", ".") + " ₺"


# ---------- durum hesabı ----------

@dataclass
class BillingState:
    status: str
    coverage_end: date | None
    days_left: int | None
    current: Subscription | None
    next: Subscription | None
    relevant: Subscription | None  # bildirim/hatırlatma işaretinin tutulduğu dönem (current ya da latest)
    outstanding: int


def payment_status(price: int, paid: int) -> str:
    if price <= 0 or price - paid <= 0:
        return "paid"
    return "partial" if paid > 0 else "unpaid"


def compute_state(
    subs: list[Subscription], paid: dict[int, int], ps: PlatformSettings, today: date
) -> BillingState:
    if not subs:
        return BillingState("untracked", None, None, None, None, None, 0)

    current = next((s for s in sorted(subs, key=lambda s: s.start_date) if s.start_date <= today <= s.end_date), None)
    latest = max(subs, key=lambda s: s.end_date)
    upcoming = sorted((s for s in subs if s.start_date > today), key=lambda s: s.start_date)
    nxt = upcoming[0] if upcoming else None
    coverage_end = latest.end_date
    days_left = (coverage_end - today).days
    has_past = any(s.start_date <= today for s in subs)

    if coverage_end + timedelta(days=ps.grace_days) < today:
        status = "expired"
    elif coverage_end < today:
        status = "grace"
    elif current is None and nxt is not None and not has_past:
        status = "scheduled"
    elif days_left <= ps.reminder_days:
        status = "due_soon"
    else:
        status = "active"

    outstanding = sum(max(s.price - paid.get(s.id, 0), 0) for s in subs if s.start_date <= today)
    return BillingState(status, coverage_end, days_left, current, nxt, current or latest, outstanding)


async def get_settings_row(db: AsyncSession) -> PlatformSettings:
    row = (await db.execute(select(PlatformSettings).where(PlatformSettings.id == 1))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=500, detail="Platform ayarları bulunamadı")
    return row


async def _paid_map(db: AsyncSession, tenant_id: int | None = None) -> dict[int, int]:
    q = select(Payment.subscription_id, func.sum(Payment.amount)).where(Payment.subscription_id.is_not(None))
    if tenant_id is not None:
        q = q.where(Payment.tenant_id == tenant_id)
    rows = (await db.execute(q.group_by(Payment.subscription_id))).all()
    return {sid: int(total) for sid, total in rows}


async def _subs_by_tenant(db: AsyncSession, tenant_id: int | None = None) -> dict[int, list[Subscription]]:
    q = select(Subscription).order_by(Subscription.start_date)
    if tenant_id is not None:
        q = q.where(Subscription.tenant_id == tenant_id)
    result: dict[int, list[Subscription]] = {}
    for s in (await db.execute(q)).scalars():
        result.setdefault(s.tenant_id, []).append(s)
    return result


def sub_out(s: Subscription, paid_amount: int) -> SubscriptionOut:
    return SubscriptionOut(
        id=s.id,
        tenant_id=s.tenant_id,
        plan_id=s.plan_id,
        plan_name=s.plan_name,
        start_date=s.start_date,
        end_date=s.end_date,
        price=s.price,
        note=s.note,
        paid_amount=paid_amount,
        balance=s.price - paid_amount,
        payment_status=payment_status(s.price, paid_amount),
        reminded_at=s.reminded_at,
        created_at=s.created_at,
        is_custom=s.plan_id is None,
    )


def sub_label(s: Subscription) -> str:
    return f"{s.plan_name} · {fmt_date(s.start_date)}–{fmt_date(s.end_date)}"


# ---------- paketler ----------

def _plan_out(p: Plan) -> PlanOut:
    return PlanOut(
        id=p.id, name=p.name, duration_months=p.duration_months, price=p.price,
        is_active=p.is_active, sort_order=p.sort_order,
    )


async def _commit_or_409(db: AsyncSession, message: str) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=message)


async def _get_plan(db: AsyncSession, plan_id: int) -> Plan:
    plan = (await db.execute(select(Plan).where(Plan.id == plan_id))).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Paket bulunamadı")
    return plan


async def list_plans(db: AsyncSession) -> list[PlanOut]:
    rows = (await db.execute(select(Plan).order_by(Plan.sort_order, Plan.id))).scalars().all()
    return [_plan_out(p) for p in rows]


async def create_plan(db: AsyncSession, data: PlanCreate) -> PlanOut:
    plan = Plan(
        name=data.name.strip(), duration_months=data.duration_months, price=data.price,
        is_active=data.is_active, sort_order=data.sort_order,
    )
    db.add(plan)
    await _commit_or_409(db, "Bu isimde bir paket zaten var")
    return _plan_out(plan)


async def update_plan(db: AsyncSession, plan_id: int, data: PlanUpdate) -> PlanOut:
    plan = await _get_plan(db, plan_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        setattr(plan, field, value.strip() if field == "name" else value)
    await _commit_or_409(db, "Bu isimde bir paket zaten var")
    return _plan_out(plan)


async def delete_plan(db: AsyncSession, plan_id: int) -> None:
    plan = await _get_plan(db, plan_id)
    used = (await db.execute(select(Subscription.id).where(Subscription.plan_id == plan_id).limit(1))).first()
    if used is not None:
        raise HTTPException(status_code=409, detail="Bu paket kullanılmış, silmek yerine pasife alın")
    await db.delete(plan)
    await db.commit()


# ---------- işletme / dönem yardımcıları ----------

async def _get_tenant(db: AsyncSession, tenant_id: int) -> Tenant:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return tenant


async def _get_sub(db: AsyncSession, sub_id: int) -> Subscription:
    sub = (await db.execute(select(Subscription).where(Subscription.id == sub_id))).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=404, detail="Abonelik dönemi bulunamadı")
    return sub


async def _check_overlap(
    db: AsyncSession, tenant_id: int, start: date, end: date, exclude_id: int | None = None
) -> None:
    q = select(Subscription.id).where(
        Subscription.tenant_id == tenant_id, Subscription.start_date <= end, Subscription.end_date >= start
    )
    if exclude_id is not None:
        q = q.where(Subscription.id != exclude_id)
    if (await db.execute(q.limit(1))).first() is not None:
        raise HTTPException(status_code=409, detail=OVERLAP_MSG)


async def reactivate_if_covered(db: AsyncSession, tenant_id: int) -> bool:
    """Otomatik askıdaki işletme tekrar kapsanıyorsa açar. Commit ETMEZ; açtıysa True döner."""
    tenant = await _get_tenant(db, tenant_id)
    if tenant.auto_suspended_at is None:
        return False
    ps = await get_settings_row(db)
    subs = (await _subs_by_tenant(db, tenant_id)).get(tenant_id, [])
    state = compute_state(subs, await _paid_map(db, tenant_id), ps, date.today())
    if state.status in COVERED_STATUSES:
        tenant.is_active = True
        tenant.auto_suspended_at = None
        return True
    return False


async def _sub_out_by_id(db: AsyncSession, sub: Subscription) -> SubscriptionOut:
    paid = (await _paid_map(db, sub.tenant_id)).get(sub.id, 0)
    return sub_out(sub, paid)


async def list_subscriptions(db: AsyncSession, tenant_id: int) -> list[SubscriptionOut]:
    await _get_tenant(db, tenant_id)
    subs = (await _subs_by_tenant(db, tenant_id)).get(tenant_id, [])
    paid = await _paid_map(db, tenant_id)
    return [sub_out(s, paid.get(s.id, 0)) for s in sorted(subs, key=lambda s: s.start_date, reverse=True)]


async def suggest_period(db: AsyncSession, tenant_id: int, plan_id: int) -> SuggestOut:
    await _get_tenant(db, tenant_id)
    plan = await _get_plan(db, plan_id)
    ps = await get_settings_row(db)
    today = date.today()
    subs = (await _subs_by_tenant(db, tenant_id)).get(tenant_id, [])
    start = today
    if subs:
        latest_end = max(s.end_date for s in subs)
        if latest_end >= today - timedelta(days=ps.grace_days):
            start = latest_end + timedelta(days=1)
    return SuggestOut(start_date=start, end_date=period_end(start, plan.duration_months), price=plan.price)


async def create_subscription(db: AsyncSession, tenant_id: int, data: SubscriptionCreate) -> SubscriptionOut:
    await _get_tenant(db, tenant_id)
    if data.plan_id is not None:
        plan = await _get_plan(db, data.plan_id)
        if not plan.is_active:
            raise HTTPException(status_code=400, detail="Bu paket pasif, başka bir paket seçin")
        plan_name = (data.plan_name or "").strip() or plan.name
        end = data.end_date or period_end(data.start_date, plan.duration_months)
        price = data.price if data.price is not None else plan.price
    else:
        if data.end_date is None or data.price is None:
            raise HTTPException(status_code=400, detail="Özel anlaşma için bitiş tarihi ve tutar zorunlu")
        plan_name = (data.plan_name or "").strip() or "Özel anlaşma"
        end = data.end_date
        price = data.price
    if end < data.start_date:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıçtan önce olamaz")
    await _check_overlap(db, tenant_id, data.start_date, end)

    sub = Subscription(
        tenant_id=tenant_id, plan_id=data.plan_id, plan_name=plan_name, start_date=data.start_date,
        end_date=end, price=price, note=(data.note or None),
    )
    db.add(sub)
    await db.flush()
    if data.initial_payment is not None:
        ip = data.initial_payment
        db.add(Payment(
            tenant_id=tenant_id, subscription_id=sub.id, amount=ip.amount, paid_on=ip.paid_on,
            method=ip.method.strip() or "IBAN", note=ip.note or None,
        ))
        await db.flush()
    await reactivate_if_covered(db, tenant_id)
    await db.commit()
    return await _sub_out_by_id(db, sub)


async def update_subscription(db: AsyncSession, sub_id: int, data: SubscriptionUpdate) -> SubscriptionOut:
    sub = await _get_sub(db, sub_id)
    fields = data.model_dump(exclude_unset=True)
    start = fields.get("start_date") or sub.start_date
    end = fields.get("end_date") or sub.end_date
    if end < start:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıçtan önce olamaz")
    await _check_overlap(db, sub.tenant_id, start, end, exclude_id=sub.id)
    sub.start_date, sub.end_date = start, end
    if fields.get("plan_name"):
        sub.plan_name = fields["plan_name"].strip()
    if fields.get("price") is not None:
        sub.price = fields["price"]
    if "note" in fields:
        sub.note = fields["note"] or None
    await db.flush()
    await reactivate_if_covered(db, sub.tenant_id)
    await db.commit()
    return await _sub_out_by_id(db, sub)


async def delete_subscription(db: AsyncSession, sub_id: int) -> None:
    sub = await _get_sub(db, sub_id)
    has_payments = (await db.execute(select(Payment.id).where(Payment.subscription_id == sub_id).limit(1))).first()
    if has_payments is not None:
        raise HTTPException(status_code=409, detail="Bu döneme ait ödemeler var, önce ödemeleri silin")
    await db.delete(sub)
    await db.commit()


async def mark_reminded(db: AsyncSession, sub_id: int) -> SubscriptionOut:
    sub = await _get_sub(db, sub_id)
    sub.reminded_at = datetime.now()
    await db.commit()
    return await _sub_out_by_id(db, sub)


# ---------- ödemeler ----------

def _payment_out(p: Payment, tenant_name: str, sub: Subscription | None) -> PaymentOut:
    return PaymentOut(
        id=p.id, tenant_id=p.tenant_id, tenant_name=tenant_name, subscription_id=p.subscription_id,
        subscription_label=sub_label(sub) if sub is not None else None, amount=p.amount,
        paid_on=p.paid_on, method=p.method, note=p.note, created_at=p.created_at,
    )


def _payments_query():
    return (
        select(Payment, Tenant.name, Subscription)
        .join(Tenant, Tenant.id == Payment.tenant_id)
        .outerjoin(Subscription, Subscription.id == Payment.subscription_id)
    )


async def list_payments(
    db: AsyncSession, tenant_id: int | None, date_from: date | None, date_to: date | None, limit: int = 500
) -> list[PaymentOut]:
    q = _payments_query()
    if tenant_id is not None:
        q = q.where(Payment.tenant_id == tenant_id)
    if date_from is not None:
        q = q.where(Payment.paid_on >= date_from)
    if date_to is not None:
        q = q.where(Payment.paid_on <= date_to)
    rows = (await db.execute(q.order_by(Payment.paid_on.desc(), Payment.id.desc()).limit(limit))).all()
    return [_payment_out(p, name, sub) for p, name, sub in rows]


async def create_payment(db: AsyncSession, data: PaymentCreate) -> PaymentOut:
    await _get_tenant(db, data.tenant_id)
    if data.subscription_id is not None:
        sub = await _get_sub(db, data.subscription_id)
        if sub.tenant_id != data.tenant_id:
            raise HTTPException(status_code=400, detail="Bu dönem seçilen işletmeye ait değil")
    payment = Payment(
        tenant_id=data.tenant_id, subscription_id=data.subscription_id, amount=data.amount,
        paid_on=data.paid_on, method=data.method.strip() or "IBAN", note=data.note or None,
    )
    db.add(payment)
    await db.flush()
    await reactivate_if_covered(db, data.tenant_id)
    await db.commit()
    row = (await db.execute(_payments_query().where(Payment.id == payment.id))).one()
    return _payment_out(*row)


async def delete_payment(db: AsyncSession, payment_id: int) -> None:
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    await db.delete(payment)
    await db.commit()


# ---------- özet / işletme listesi ----------

def _renewal(subs: list[Subscription], plans: dict[int, Plan]) -> tuple[str | None, int | None]:
    if not subs:
        return None, None
    latest = max(subs, key=lambda s: s.end_date)
    plan = plans.get(latest.plan_id) if latest.plan_id else None
    if plan is not None and plan.is_active and plan.price > 0:
        return plan.name, plan.price
    return latest.plan_name, latest.price


async def _build_tenant_billings(db: AsyncSession) -> list[tuple[Tenant, TenantBilling, BillingState]]:
    ps = await get_settings_row(db)
    today = date.today()
    subs_map = await _subs_by_tenant(db)
    paid = await _paid_map(db)
    last_paid = dict(
        (await db.execute(select(Payment.tenant_id, func.max(Payment.paid_on)).group_by(Payment.tenant_id))).all()
    )
    plans = {p.id: p for p in (await db.execute(select(Plan))).scalars()}
    rows = (await db.execute(platform_services._tenant_out_query().order_by(Tenant.id))).all()
    result = []
    for tenant, _sc, _ac, o_name, o_surname, o_phone in rows:
        subs = subs_map.get(tenant.id, [])
        state = compute_state(subs, paid, ps, today)
        renewal_name, renewal_price = _renewal(subs, plans)
        if state.outstanding > 0:
            amount_due = state.outstanding
        elif state.status in ("due_soon", "grace", "expired") and state.next is None:
            amount_due = renewal_price or 0
        else:
            amount_due = 0
        tb = TenantBilling(
            tenant_id=tenant.id, tenant_name=tenant.name, slug=tenant.slug, is_active=tenant.is_active,
            auto_suspended_at=tenant.auto_suspended_at,
            owner_name=" ".join(p for p in (o_name, o_surname) if p) or None, owner_phone=o_phone,
            status=state.status, coverage_end=state.coverage_end, days_left=state.days_left,
            current=sub_out(state.current, paid.get(state.current.id, 0)) if state.current else None,
            next=sub_out(state.next, paid.get(state.next.id, 0)) if state.next else None,
            outstanding=state.outstanding, last_payment_on=last_paid.get(tenant.id),
            reminded_at=state.relevant.reminded_at if state.relevant else None,
            renewal_plan_name=renewal_name, renewal_price=renewal_price, amount_due=amount_due,
        )
        result.append((tenant, tb, state))
    return result


async def list_tenant_billing(db: AsyncSession) -> list[TenantBilling]:
    return [tb for _t, tb, _s in await _build_tenant_billings(db)]


async def overview(db: AsyncSession) -> BillingOverview:
    today = date.today()
    billings = await list_tenant_billing(db)

    async def revenue(since: date) -> int:
        return int(
            (await db.execute(select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.paid_on >= since, Payment.paid_on <= today))).scalar_one()
        )

    def count(status: str) -> int:
        return sum(1 for b in billings if b.status == status)

    tracked = sum(1 for b in billings if b.status != "untracked")
    stats = BillingStats(
        revenue_this_month=await revenue(today.replace(day=1)),
        revenue_this_year=await revenue(today.replace(month=1, day=1)),
        revenue_last_30_days=await revenue(today - timedelta(days=30)),
        outstanding_total=sum(b.outstanding for b in billings),
        due_soon_count=count("due_soon"), grace_count=count("grace"), expired_count=count("expired"),
        tracked_count=tracked, untracked_count=len(billings) - tracked,
    )
    attention = [b for b in billings if b.status in ATTENTION_ORDER or b.outstanding > 0]
    attention.sort(key=lambda b: (ATTENTION_ORDER.get(b.status, 3), b.days_left if b.days_left is not None else 0))
    return BillingOverview(
        stats=stats, attention=attention, recent_payments=await list_payments(db, None, None, None, limit=10)
    )


# ---------- ayarlar ----------

def _settings_out(row: PlatformSettings) -> PlatformSettingsOut:
    return PlatformSettingsOut(
        iban=row.iban, account_holder=row.account_holder, bank_name=row.bank_name,
        reminder_days=row.reminder_days, grace_days=row.grace_days, notify_email=row.notify_email,
        reminder_template=row.reminder_template, overdue_template=row.overdue_template,
        email_configured=notify_services.email_configured(), push_configured=notify_services.push_configured(),
    )


async def get_settings(db: AsyncSession) -> PlatformSettingsOut:
    return _settings_out(await get_settings_row(db))


async def update_settings(db: AsyncSession, data: PlatformSettingsUpdate) -> PlatformSettingsOut:
    row = await get_settings_row(db)
    iban = re.sub(r"\s+", "", data.iban or "").upper() or None
    if iban is not None and not IBAN_RE.match(iban):
        raise HTTPException(status_code=400, detail="IBAN 'TR' ile başlamalı ve toplam 26 karakter olmalı")
    email = (data.notify_email or "").strip() or None
    if email is not None and not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi girin")
    row.iban = iban
    row.account_holder = (data.account_holder or "").strip() or None
    row.bank_name = (data.bank_name or "").strip() or None
    row.reminder_days = data.reminder_days
    row.grace_days = data.grace_days
    row.notify_email = email
    row.reminder_template = data.reminder_template
    row.overdue_template = data.overdue_template
    await db.commit()
    return _settings_out(row)


# ---------- push abonelikleri ----------

async def push_subscribe(db: AsyncSession, admin_id: int, data: PushSubscribeIn, user_agent: str | None) -> None:
    existing = (
        await db.execute(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    ).scalar_one_or_none()
    if existing is None:
        existing = PushSubscription(endpoint=data.endpoint, platform_admin_id=admin_id,
                                    p256dh=data.keys.p256dh, auth=data.keys.auth)
        db.add(existing)
    existing.platform_admin_id = admin_id
    existing.p256dh = data.keys.p256dh
    existing.auth = data.keys.auth
    existing.user_agent = (user_agent or None) and user_agent[:500]
    await _commit_or_409(db, "Abonelik kaydedilemedi")


async def push_unsubscribe(db: AsyncSession, endpoint: str) -> None:
    await db.execute(delete(PushSubscription).where(PushSubscription.endpoint == endpoint))
    await db.commit()


# ---------- günlük görev ----------

STATUS_TR = {"due_soon": "Ödeme yaklaşıyor", "grace": "Süresi doldu (ek süre)", "expired": "Askıya alındı"}


def _build_email(items: list[dict]) -> tuple[str, str]:
    text_lines, html_rows = [], []
    for it in items:
        wa = f"https://wa.me/90{it['phone']}" if it["phone"] else ""
        text_lines.append(
            f"- {it['name']} | {it['status']} | Bitiş: {fmt_date(it['end'])} | Kalan tutar: {fmt_money(it['balance'])}"
            f" | Sahip: {it['owner'] or '-'} {it['phone'] or ''} {wa}".rstrip()
        )
        link = f'<a href="{wa}">WhatsApp</a>' if wa else "-"
        html_rows.append(
            "<tr>" + "".join(
                f'<td style="padding:6px 10px;border:1px solid #ddd">{html.escape(str(c)) if i < 5 else c}</td>'
                for i, c in enumerate([
                    it["name"], it["status"], fmt_date(it["end"]), fmt_money(it["balance"]),
                    f"{it['owner'] or '-'} {it['phone'] or ''}".strip(), link,
                ])
            ) + "</tr>"
        )
    head = "".join(
        f'<th style="padding:6px 10px;border:1px solid #ddd;text-align:left">{h}</th>'
        for h in ("İşletme", "Durum", "Bitiş", "Kalan tutar", "Sahip", "WhatsApp")
    )
    html_body = (
        "<p>Abonelik takibi özeti:</p>"
        f'<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px"><tr>{head}</tr>'
        + "".join(html_rows) + "</table>"
    )
    return html_body, "Abonelik takibi özeti:\n" + "\n".join(text_lines)


async def run_billing_checks(db: AsyncSession) -> RunChecksResult:
    today = date.today()
    now = datetime.now()
    suspended: list[str] = []
    reactivated: list[str] = []
    items: list[dict] = []
    checked = 0

    for tenant, tb, state in await _build_tenant_billings(db):
        if state.status == "untracked":
            continue
        checked += 1
        rel = state.relevant
        newly_suspended = False

        if state.status == "expired" and tenant.is_active and tenant.auto_suspended_at is None:
            tenant.is_active = False
            tenant.auto_suspended_at = now
            suspended.append(tenant.name)
            newly_suspended = True
        elif state.status in COVERED_STATUSES and tenant.auto_suspended_at is not None:
            tenant.is_active = True
            tenant.auto_suspended_at = None
            reactivated.append(tenant.name)

        notify = newly_suspended
        if state.status in ("due_soon", "grace") and rel is not None and rel.last_notified_on != today:
            rel.last_notified_on = today
            notify = True
        if notify:
            items.append({
                "name": tenant.name, "status": STATUS_TR.get(state.status, state.status),
                "end": state.coverage_end, "balance": tb.amount_due,
                "owner": tb.owner_name, "phone": tb.owner_phone, "kind": state.status,
            })
    await db.commit()

    push_sent, email_sent = 0, False
    if items:
        soon = sum(1 for i in items if i["kind"] == "due_soon")
        late = sum(1 for i in items if i["kind"] == "grace")
        susp = sum(1 for i in items if i["kind"] == "expired")
        parts = [p for p in (
            f"{soon} ödemesi yaklaşıyor" if soon else "",
            f"{late} gecikmiş" if late else "",
            f"{susp} askıya alındı" if susp else "",
        ) if p]
        body = f"{len(items)} işletme: " + ", ".join(parts)
        try:
            push_sent = await notify_services.send_push_to_all(db, "Abonelik takibi", body, "/platform/odemeler")
        except Exception:
            logger.exception("Push notification step failed")
        ps = await get_settings_row(db)
        try:
            html_body, text_body = _build_email(items)
            email_sent = await notify_services.send_email(
                ps.notify_email, f"BehTech: {len(items)} işletme için ödeme takibi", html_body, text_body
            )
        except Exception:
            logger.exception("Email notification step failed")

    return RunChecksResult(
        checked=checked, notified=len(items), suspended=suspended, reactivated=reactivated,
        email_sent=email_sent, push_sent=push_sent,
    )

