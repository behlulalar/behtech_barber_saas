"""Tanıtım sitesi sayaçları (çerezsiz, kişisel veri yok)."""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.site_stat import SiteStat
from app.models.tenant import Tenant
from app.schemas.site_stats import SiteStatDay, SiteStatsOut


async def hit(db: AsyncSession, event: str) -> None:
    """Bugünün sayacını atomik olarak 1 artırır."""
    stmt = insert(SiteStat).values(day=date.today(), event=event, count=1).on_conflict_do_update(
        index_elements=["day", "event"], set_={"count": SiteStat.count + 1})
    await db.execute(stmt)
    await db.commit()


async def stats(db: AsyncSession, days: int) -> SiteStatsOut:
    today = date.today()
    start = today - timedelta(days=days - 1)
    rows = (await db.execute(select(SiteStat).where(SiteStat.day >= start))).scalars().all()
    by_day = {start + timedelta(days=i): SiteStatDay(day=start + timedelta(days=i)) for i in range(days)}
    for r in rows:
        if r.day in by_day:
            setattr(by_day[r.day], r.event, r.count)
    signups = (await db.execute(
        select(func.count()).select_from(Tenant).where(Tenant.signup_status.is_not(None), func.date(Tenant.created_at) >= start)
    )).scalar_one()
    series = list(by_day.values())
    return SiteStatsOut(
        days=series, view=sum(d.view for d in series), trial_click=sum(d.trial_click for d in series),
        demo_click=sum(d.demo_click for d in series), signups=signups,
    )
