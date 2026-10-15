"""KVKK/şart onay kayıtları."""
from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.legal import CUSTOMER_PRIVACY_VERSION
from app.core.net import client_ip
from app.models.consent_record import ConsentRecord

CUSTOMER_PRIVACY = "customer_privacy"
TENANT_TERMS = "tenant_terms"


async def has_consent(db: AsyncSession, kind: str, tenant_id: int | None, phone: str, version: str) -> bool:
    found = await db.execute(
        select(ConsentRecord.id).where(
            ConsentRecord.kind == kind, ConsentRecord.tenant_id == tenant_id,
            ConsentRecord.phone == phone, ConsentRecord.version == version,
        ).limit(1)
    )
    return found.first() is not None


async def record_consent(
    db: AsyncSession, kind: str, tenant_id: int | None, phone: str, version: str, request: Request | None
) -> None:
    """Aynı (tür, işletme, telefon, sürüm) için tek kayıt tutar. Commit çağıranda."""
    if await has_consent(db, kind, tenant_id, phone, version):
        return
    db.add(ConsentRecord(kind=kind, version=version, tenant_id=tenant_id, phone=phone, ip=client_ip(request)))


async def require_customer_consent(
    db: AsyncSession, tenant_id: int, phone: str, accepted: bool, request: Request
) -> None:
    """Müşteri aydınlatma metni: daha önce bu sürüm onaylandıysa tekrar istenmez, yoksa kutu işaretli olmalı."""
    if accepted:
        await record_consent(db, CUSTOMER_PRIVACY, tenant_id, phone, CUSTOMER_PRIVACY_VERSION, request)
        return
    if not await has_consent(db, CUSTOMER_PRIVACY, tenant_id, phone, CUSTOMER_PRIVACY_VERSION):
        raise HTTPException(status_code=400, detail="Devam etmek için aydınlatma metnini okuduğunuzu onaylayın")
