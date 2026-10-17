"""İşlenmemiş sunucu hatalarının kaydı ve sayacı (platform Sistem sayfası). Kayıt hatası asla asıl isteği bozmaz."""
import logging
import random
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select

from app.core.database import SessionFactory
from app.models.error_event import ErrorEvent

logger = logging.getLogger(__name__)
RETENTION = timedelta(days=14)
MAX_PER_MINUTE = 60  # hata fırtınasında tabloyu şişirmemek için


async def record(method: str, path: str, exc: BaseException) -> None:
    try:
        async with SessionFactory() as db:
            recent = (await db.execute(
                select(func.count()).select_from(ErrorEvent).where(ErrorEvent.at > datetime.now() - timedelta(minutes=1))
            )).scalar_one()
            if recent >= MAX_PER_MINUTE:
                return
            db.add(ErrorEvent(method=method[:8], path=path.split("?")[0][:200], error=f"{type(exc).__name__}: {str(exc)}"[:200]))
            if random.random() < 0.02:  # ara sıra eski kayıtları temizle
                await db.execute(delete(ErrorEvent).where(ErrorEvent.at < datetime.now() - RETENTION))
            await db.commit()
    except Exception:
        logger.exception("Hata kaydı yazılamadı")


async def stats(db):
    from app.schemas.platform import ErrorRecent, ErrorStatus

    now = datetime.now()
    async def n(since):
        return (await db.execute(select(func.count()).select_from(ErrorEvent).where(ErrorEvent.at > since))).scalar_one()
    rows = (await db.execute(select(ErrorEvent).order_by(ErrorEvent.id.desc()).limit(10))).scalars().all()
    return ErrorStatus(
        last_hour=await n(now - timedelta(hours=1)), last_24h=await n(now - timedelta(hours=24)),
        recent=[ErrorRecent(at=r.at, method=r.method, path=r.path, error=r.error) for r in rows],
    )
