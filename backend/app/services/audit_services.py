"""Denetim kaydı: kim, ne zaman, neyi yaptı. Aynı transaction'da yazılır; commit çağıran yerde.
details'e parola, IBAN'ın tamamı, token ASLA yazılmaz (yalnızca değişen alan adları vb.)."""
from datetime import date, datetime, time, timedelta

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.net import client_ip
from app.models.audit_log import AuditLog
from app.models.platform_admin import PlatformAdmin
from app.models.staff import Staff
from app.models.tenant import Tenant
from app.schemas.platform import AuditActionOut, AuditLogOut, AuditPage

G_ACCOUNT, G_ADMIN, G_TENANT, G_PLAN, G_SUB, G_PAYMENT, G_SETTINGS, G_SYSTEM, G_SUPPORT = (
    "Hesap", "Yönetici", "İşletme", "Paket", "Abonelik", "Ödeme", "Ayarlar", "Sistem", "Destek",
)

# (value, label, group)
CATALOG: list[tuple[str, str, str]] = [
    ("platform.login", "Platform girişi", G_ACCOUNT),
    ("platform.login_locked", "Girişe çok fazla hatalı deneme", G_ACCOUNT),
    ("platform.password_changed", "Şifre değiştirildi", G_ACCOUNT),
    ("platform.logout_all", "Tüm cihazlardan çıkış", G_ACCOUNT),
    ("platform.2fa_enabled", "2FA açıldı", G_ACCOUNT),
    ("platform.2fa_disabled", "2FA kapatıldı", G_ACCOUNT),
    ("platform.2fa_backup_regenerated", "2FA yedek kodları yenilendi", G_ACCOUNT),
    ("admin.2fa_reset", "Yöneticinin 2FA'sı sıfırlandı", G_ADMIN),
    ("admin.create", "Yönetici eklendi", G_ADMIN),
    ("admin.update", "Yönetici güncellendi", G_ADMIN),
    ("admin.password_reset", "Yönetici şifresi sıfırlandı", G_ADMIN),
    ("admin.delete", "Yönetici silindi", G_ADMIN),
    ("tenant.create", "İşletme oluşturuldu", G_TENANT),
    ("tenant.login_token_regenerate", "Panel giriş adresi yenilendi", G_TENANT),
    ("tenant.signup", "İşletme kendi kayıt oldu", G_TENANT),
    ("tenant.signup_approve", "Kayıt başvurusu onaylandı", G_TENANT),
    ("tenant.signup_reject", "Kayıt başvurusu reddedildi", G_TENANT),
    ("tenant.rename", "İşletme adı değişti", G_TENANT),
    ("tenant.activate", "İşletme aktifleştirildi", G_TENANT),
    ("tenant.deactivate", "İşletme devre dışı bırakıldı", G_TENANT),
    ("tenant.note_update", "İşletme notu değişti", G_TENANT),
    ("tenant.owner_update", "İşletme sahibi bilgisi değişti", G_TENANT),
    ("tenant.owner_password_reset", "İşletme sahibi şifresi sıfırlandı", G_TENANT),
    ("whatsapp.pause", "İşletmenin WhatsApp gönderimi durduruldu", G_TENANT),
    ("whatsapp.resume", "İşletmenin WhatsApp gönderimi açıldı", G_TENANT),
    ("notification.send", "İşletmeye bildirim gönderildi", G_TENANT),
    ("support.reply", "Destek talebi yanıtlandı", G_TENANT),
    ("support.close", "Destek talebi kapatıldı", G_TENANT),
    ("announcement.create", "Duyuru yayınlandı", G_SETTINGS),
    ("announcement.update", "Duyuru güncellendi", G_SETTINGS),
    ("announcement.delete", "Duyuru silindi", G_SETTINGS),
    ("plan.create", "Paket oluşturuldu", G_PLAN),
    ("plan.update", "Paket güncellendi", G_PLAN),
    ("plan.delete", "Paket silindi", G_PLAN),
    ("subscription.create", "Abonelik dönemi eklendi", G_SUB),
    ("subscription.update", "Abonelik dönemi güncellendi", G_SUB),
    ("subscription.delete", "Abonelik dönemi silindi", G_SUB),
    ("subscription.reminded", "Hatırlatma işaretlendi", G_SUB),
    ("payment.create", "Ödeme alındı", G_PAYMENT),
    ("payment.delete", "Ödeme silindi", G_PAYMENT),
    ("settings.update", "Platform ayarları değişti", G_SETTINGS),
    ("billing.run_checks", "Günlük kontrol çalıştı", G_SYSTEM),
    ("billing.auto_suspend", "İşletme otomatik askıya alındı", G_SYSTEM),
    ("billing.auto_reactivate", "İşletme otomatik yeniden açıldı", G_SYSTEM),
    ("impersonation.start", "Destek girişi başlatıldı", G_SUPPORT),
    ("impersonation.end", "Destek girişi bitti", G_SUPPORT),
    ("impersonation.action", "Destek modunda işlem", G_SUPPORT),
]
LABELS = {v: label for v, label, _ in CATALOG}


def actor_info(actor: PlatformAdmin | Staff | None) -> tuple[str, int | None, str]:
    if actor is None:
        return "system", None, "Sistem"
    if isinstance(actor, PlatformAdmin):
        return "platform_admin", actor.id, f"{actor.name} ({actor.phone})" if actor.name else actor.phone
    return "staff", actor.id, f"{actor.name} {actor.surname}".strip() or actor.phone


async def audit(
    db: AsyncSession,
    *,
    actor: PlatformAdmin | Staff | None,
    action: str,
    summary: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    tenant_id: int | None = None,
    details: dict | None = None,
    request: Request | None = None,
    actor_label: str | None = None,
    ip: str | None = None,
) -> None:
    """Kayıt ekler (flush eder, commit ETMEZ). actor=None sistem demektir; actor_label giriş
    kilidi gibi aktörün olmadığı durumlarda (telefon) etiketi ezmek içindir."""
    actor_type, actor_id, label = actor_info(actor)
    db.add(AuditLog(
        actor_type=actor_type, actor_id=actor_id, actor_label=(actor_label or label)[:120],
        action=action, summary=summary, entity_type=entity_type, entity_id=entity_id,
        tenant_id=tenant_id, details=details, ip=ip or client_ip(request),
    ))
    await db.flush()


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_audit(
    db: AsyncSession, *, limit: int, offset: int, action: str | None, group: str | None,
    tenant_id: int | None, actor_id: int | None, date_from: date | None, date_to: date | None, q: str | None,
) -> AuditPage:
    conds = []
    if action:
        conds.append(AuditLog.action == action)
    if group:
        conds.append(AuditLog.action.in_([v for v, _, g in CATALOG if g == group]))
    if tenant_id is not None:
        conds.append(AuditLog.tenant_id == tenant_id)
    if actor_id is not None:
        conds.append(AuditLog.actor_id == actor_id)
    if date_from is not None:
        conds.append(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to is not None:
        conds.append(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min))
    if q and q.strip():
        like = f"%{_escape_like(q.strip())}%"
        conds.append(AuditLog.summary.ilike(like, escape="\\") | AuditLog.actor_label.ilike(like, escape="\\"))

    total = (await db.execute(select(func.count(AuditLog.id)).where(*conds))).scalar_one()
    rows = (await db.execute(
        select(AuditLog, Tenant.name)
        .outerjoin(Tenant, Tenant.id == AuditLog.tenant_id)
        .where(*conds)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit).offset(offset)
    )).all()
    items = [
        AuditLogOut(
            id=a.id, created_at=a.created_at, actor_type=a.actor_type, actor_id=a.actor_id,
            actor_label=a.actor_label, action=a.action, action_label=LABELS.get(a.action, a.action),
            entity_type=a.entity_type, entity_id=a.entity_id, tenant_id=a.tenant_id, tenant_name=tname,
            summary=a.summary, details=a.details, ip=a.ip,
        )
        for a, tname in rows
    ]
    return AuditPage(items=items, total=total, limit=limit, offset=offset)


def actions_catalog() -> list[AuditActionOut]:
    return [AuditActionOut(value=v, label=label, group=g) for v, label, g in CATALOG]
