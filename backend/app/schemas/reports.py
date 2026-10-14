"""Gelir raporu (admin) yanıt şemaları."""
from datetime import date
from typing import Literal

from pydantic import BaseModel

ReportPeriod = Literal["day", "month", "year"]


class SeriesPoint(BaseModel):
    # day: saat (0-23), month: ayın günü (1-31), year: ay (1-12)
    key: int
    revenue: int
    count: int


class ServiceRevenue(BaseModel):
    service_id: int
    name: str
    count: int
    revenue: int
    share_pct: float  # toplam gelirdeki payı (0-100)


class PaymentMethodRevenue(BaseModel):
    method: str | None  # None = ödeme yöntemi belirtilmemiş
    count: int
    revenue: int


class StaffRevenue(BaseModel):
    staff_id: int
    name: str
    surname: str
    count: int
    revenue: int


class PeriodTotals(BaseModel):
    revenue: int
    completed_count: int


class RevenueReport(BaseModel):
    period: ReportPeriod
    date_from: date
    date_to: date
    staff_id: int | None
    # Gerçekleşen gelir: yalnızca "tamamlandı" randevuların hizmet fiyatları toplamı.
    revenue: int
    completed_count: int
    average_ticket: int
    cancelled_count: int
    no_show_count: int
    # Henüz tamamlandı işaretlenmemiş (bekleyen/onaylı) randevuların toplam tutarı; gerçekleşen gelire dahil değil.
    open_count: int
    open_revenue: int
    previous: PeriodTotals
    previous_date_from: date
    previous_date_to: date
    series: list[SeriesPoint]
    by_service: list[ServiceRevenue]
    by_payment_method: list[PaymentMethodRevenue]
    by_staff: list[StaffRevenue]  # sadece yöneticilere dolu
