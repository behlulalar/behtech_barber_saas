"""Dönüşüm hunisi: kendi kayıt olan işletmeler (signup_status dolu) hangi adımda kalıyor."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment
from app.models.payment import Payment
from app.models.tenant import Tenant
from app.schemas.funnel import FunnelOut, FunnelStep
from app.services import platform_services


def _pct(a: int, b: int) -> int | None:
    return round(a / b * 100) if b else None


async def build(db: AsyncSession) -> FunnelOut:
    signed = (await db.execute(select(Tenant.id, Tenant.signup_status).where(Tenant.signup_status.is_not(None)))).all()
    all_ids = [i for i, _s in signed]
    approved = [i for i, s in signed if s == "approved"]
    setups = await platform_services._setup_for(db, approved) if approved else {}
    ready_now = {i for i in approved if setups[i].ready}
    with_appt = set((await db.execute(select(Appointment.tenant_id).where(Appointment.tenant_id.in_(approved)).distinct())).scalars().all()) if approved else set()
    paid = set((await db.execute(select(Payment.tenant_id).where(Payment.tenant_id.in_(approved)).distinct())).scalars().all()) if approved else set()
    # "Ulaştı" mantığı: ilerideki bir adıma geçen işletme önceki adımları da geçmiş sayılır (huni her zaman azalır).
    booking = with_appt | paid
    ready = ready_now | booking
    raw = [
        ("signup", "Kayıt oldu", len(all_ids)),
        ("approved", "Onaylandı", len(approved)),
        ("ready", "Kurulumu tamamladı", len(ready)),
        ("booking", "İlk randevusunu aldı", len(booking)),
        ("paid", "Ödeme yaptı", len(paid)),
    ]
    steps = []
    for i, (k, label, n) in enumerate(raw):
        steps.append(FunnelStep(key=k, label=label, count=n, pct_of_first=_pct(n, raw[0][2]) if i else None,
                                pct_of_prev=_pct(n, raw[i - 1][2]) if i else None))
    return FunnelOut(steps=steps)
