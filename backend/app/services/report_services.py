"""Gelir raporu. Her sorgu tenant_id ile kısıtlıdır.

Gelir = tamamlandı (completed) randevuların hizmet fiyatı. Randevu kaydında fiyat saklanmadığı için
tutar, hizmetin o anki fiyatıdır (hizmet fiyatı sonradan değişirse geçmiş rapor da değişir).
"""
import calendar
from datetime import date, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.models.service import Service
from app.models.staff import Staff
from app.schemas.reports import (
    PaymentMethodRevenue,
    PeriodTotals,
    ReportPeriod,
    RevenueReport,
    SeriesPoint,
    ServiceRevenue,
    StaffRevenue,
)

S = AppointmentStatus


def period_range(period: ReportPeriod, anchor: date) -> tuple[date, date]:
    if period == "day":
        return anchor, anchor
    if period == "month":
        return anchor.replace(day=1), anchor.replace(day=calendar.monthrange(anchor.year, anchor.month)[1])
    return date(anchor.year, 1, 1), date(anchor.year, 12, 31)


def previous_range(period: ReportPeriod, anchor: date) -> tuple[date, date]:
    start, _ = period_range(period, anchor)
    return period_range(period, start - timedelta(days=1))


def _base(tenant_id: int, start: date, end: date, staff_id: int | None):
    conds = [
        Appointment.tenant_id == tenant_id,
        Appointment.appointment_date >= start,
        Appointment.appointment_date <= end,
    ]
    if staff_id is not None:
        conds.append(Appointment.staff_id == staff_id)
    return conds


def _completed_only(conds: list) -> list:
    return conds + [Appointment.status == S.COMPLETED]


async def _totals(db: AsyncSession, tenant_id: int, start: date, end: date, staff_id: int | None) -> PeriodTotals:
    row = (
        await db.execute(
            select(func.coalesce(func.sum(Service.price), 0), func.count(Appointment.id))
            .join(Service, Appointment.service_id == Service.id)
            .where(*_completed_only(_base(tenant_id, start, end, staff_id)))
        )
    ).one()
    return PeriodTotals(revenue=int(row[0]), completed_count=int(row[1]))


async def build_revenue_report(
    db: AsyncSession, tenant_id: int, period: ReportPeriod, anchor: date, staff_id: int | None, include_staff: bool
) -> RevenueReport:
    start, end = period_range(period, anchor)
    base = _base(tenant_id, start, end, staff_id)
    done = _completed_only(base)

    # --- durum bazlı özet
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(case((Appointment.status == S.COMPLETED, Service.price), else_=0)), 0),
                func.count(case((Appointment.status == S.COMPLETED, 1))),
                func.count(case((Appointment.status == S.CANCELLED, 1))),
                func.count(case((Appointment.status == S.NO_SHOW, 1))),
                func.count(case((Appointment.status.in_((S.PENDING, S.CONFIRMED)), 1))),
                func.coalesce(
                    func.sum(case((Appointment.status.in_((S.PENDING, S.CONFIRMED)), Service.price), else_=0)), 0
                ),
            )
            .join(Service, Appointment.service_id == Service.id)
            .where(*base)
        )
    ).one()
    revenue, completed, cancelled, no_show, open_count, open_revenue = (int(x) for x in row)

    # --- zaman serisi
    if period == "day":
        bucket = func.extract("hour", Appointment.appointment_time)
    elif period == "month":
        bucket = func.extract("day", Appointment.appointment_date)
    else:
        bucket = func.extract("month", Appointment.appointment_date)
    rows = (
        await db.execute(
            select(bucket, func.coalesce(func.sum(Service.price), 0), func.count(Appointment.id))
            .join(Service, Appointment.service_id == Service.id)
            .where(*done)
            .group_by(bucket)
        )
    ).all()
    data = {int(k): (int(r), int(c)) for k, r, c in rows}
    if period == "day":
        lo = min([9, *data.keys()])
        hi = max([20, *data.keys()])
        keys = range(lo, hi + 1)
    elif period == "month":
        keys = range(1, end.day + 1)
    else:
        keys = range(1, 13)
    series = [SeriesPoint(key=k, revenue=data.get(k, (0, 0))[0], count=data.get(k, (0, 0))[1]) for k in keys]

    # --- hizmet bazlı
    rows = (
        await db.execute(
            select(Service.id, Service.name, func.count(Appointment.id), func.coalesce(func.sum(Service.price), 0))
            .join(Service, Appointment.service_id == Service.id)
            .where(*done)
            .group_by(Service.id, Service.name)
            .order_by(func.sum(Service.price).desc(), Service.name)
        )
    ).all()
    by_service = [
        ServiceRevenue(
            service_id=sid, name=name, count=int(cnt), revenue=int(rev),
            share_pct=round(int(rev) * 100 / revenue, 1) if revenue else 0.0,
        )
        for sid, name, cnt, rev in rows
    ]

    # --- ödeme yöntemi bazlı
    rows = (
        await db.execute(
            select(Appointment.payment_method, func.count(Appointment.id), func.coalesce(func.sum(Service.price), 0))
            .join(Service, Appointment.service_id == Service.id)
            .where(*done)
            .group_by(Appointment.payment_method)
            .order_by(func.sum(Service.price).desc())
        )
    ).all()
    by_payment = [PaymentMethodRevenue(method=m or None, count=int(c), revenue=int(r)) for m, c, r in rows]

    # --- personel bazlı (yalnızca yönetici)
    by_staff: list[StaffRevenue] = []
    if include_staff:
        rows = (
            await db.execute(
                select(Staff.id, Staff.name, Staff.surname, Staff.is_active, func.count(Appointment.id), func.coalesce(func.sum(Service.price), 0))
                .join(Service, Appointment.service_id == Service.id)
                .join(Staff, Appointment.staff_id == Staff.id)
                .where(*done)
                .group_by(Staff.id, Staff.name, Staff.surname, Staff.is_active)
                .order_by(func.sum(Service.price).desc())
            )
        ).all()
        by_staff = [StaffRevenue(staff_id=i, name=n, surname=s, is_active=a, count=int(c), revenue=int(r)) for i, n, s, a, c, r in rows]

    prev_start, prev_end = previous_range(period, anchor)
    return RevenueReport(
        period=period, date_from=start, date_to=end, staff_id=staff_id,
        revenue=revenue, completed_count=completed,
        average_ticket=round(revenue / completed) if completed else 0,
        cancelled_count=cancelled, no_show_count=no_show,
        open_count=open_count, open_revenue=open_revenue,
        previous=await _totals(db, tenant_id, prev_start, prev_end, staff_id),
        previous_date_from=prev_start, previous_date_to=prev_end,
        series=series, by_service=by_service, by_payment_method=by_payment, by_staff=by_staff,
    )
