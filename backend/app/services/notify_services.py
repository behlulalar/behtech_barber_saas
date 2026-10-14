"""Platform sahibine bildirim: web push (VAPID) ve SMTP e-posta. Hatalar fırlatılmaz, loglanır."""
import asyncio
import json
import logging
import smtplib
from email.message import EmailMessage

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


def push_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def email_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def _send_one_push(sub: PushSubscription, payload: str) -> int | None:
    """Gönderir; ölü abonelikte (404/410) HTTP kodunu, başarıda None döner. Diğer hatalarda fırlatır."""
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject or "mailto:admin@example.com"},
            ttl=86400,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            return status
        raise
    return None


async def send_push_to_all(db: AsyncSession, title: str, body: str, url: str) -> int:
    """Tüm aboneliklere gönderir, başarılı sayıyı döner. Ölü abonelikleri siler."""
    if not push_configured():
        return 0
    subs = (await db.execute(select(PushSubscription))).scalars().all()
    if not subs:
        return 0
    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0
    dead: list[int] = []
    for sub in subs:
        try:
            dead_status = await asyncio.to_thread(_send_one_push, sub, payload)
        except Exception:
            logger.exception("Push send failed for subscription %s", sub.id)
            continue
        if dead_status is None:
            sent += 1
        else:
            dead.append(sub.id)
    if dead:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead)))
        await db.commit()
    return sent


def _send_email_sync(to: str, subject: str, html: str, text: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


async def send_email(to: str | None, subject: str, html: str, text: str) -> bool:
    if not to or not email_configured():
        return False
    try:
        await asyncio.to_thread(_send_email_sync, to, subject, html, text)
        return True
    except Exception:
        logger.exception("Email send failed")
        return False
