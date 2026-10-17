"""Platform aksiyon kuyruğu: dağınık uyarıların tek listesi."""
from datetime import date, datetime, timedelta

from sqlalchemy import update

from app.core.database import SessionFactory
from app.models.notification import Notification
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from app.models.whatsapp_connection import WhatsappConnection
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()


async def queue(api, admin):
    r = await api.get("/api/platform/actions", token=mint_platform_token(admin))
    assert r.status_code == 200, r.text
    return r.json()


async def test_empty_queue_and_auth(api, platform_admin, shop):
    q = await queue(api, platform_admin)
    # Testte yedek klasörü yok: yalnızca "yedek alınmamış" sistem uyarısı beklenir; başvuru/ödeme/WhatsApp/bildirim maddesi yok.
    assert [i["key"] for i in q["items"] if i["category"] != "system"] == []
    assert (await api.get("/api/platform/actions", token=shop.owner_token)).status_code == 401
    assert (await api.get("/api/platform/actions")).status_code == 401


async def test_queue_collects_signups_billing_whatsapp_and_unread_critical(api, platform_admin, shop, shop2):
    # 1) onay bekleyen başvuru
    t = await make_tenant("yeni", "Yeni Dükkân", active=False)
    async with SessionFactory() as db:
        await db.execute(update(Tenant).where(Tenant.id == t.id).values(signup_status="pending"))
        # 2) bitmiş abonelik (shop)
        db.add(Subscription(tenant_id=shop.tenant.id, plan_name="Aylık", start_date=TODAY - timedelta(days=60),
                            end_date=TODAY - timedelta(days=30), price=1000))
        await db.commit()
    # 3) WhatsApp'ı kopan işletme (shop2)
    await connect_whatsapp(shop2.tenant.id, state="close")
    async with SessionFactory() as db:
        await db.execute(update(WhatsappConnection).where(WhatsappConnection.tenant_id == shop2.tenant.id).values(disconnect_reason="logged_out"))
        # 4) 2 gündür okunmamış acil bildirim (shop2)
        db.add(Notification(tenant_id=shop2.tenant.id, kind="message", level="critical", title="Bakım", body="x",
                            created_at=datetime.now() - timedelta(days=2)))
        # yeni (1 saatlik) acil bildirim kuyruğa girmez
        db.add(Notification(tenant_id=shop.tenant.id, kind="message", level="critical", title="Yeni", body="x"))
        await db.commit()

    q = await queue(api, platform_admin)
    cats = {(i["category"], i["tenant_id"]) for i in q["items"]}
    assert ("signup", None) in cats
    assert ("billing", shop.tenant.id) in cats
    assert ("whatsapp", shop2.tenant.id) in cats
    assert ("notification", shop2.tenant.id) in cats
    assert ("notification", shop.tenant.id) not in cats  # henüz 24 saat dolmadı
    assert q["total"] == len(q["items"]) and q["high"] == sum(1 for i in q["items"] if i["severity"] == "high")
    # yüksek öncelik üstte
    sev = [i["severity"] for i in q["items"]]
    assert sev == sorted(sev, key=lambda s: {"high": 0, "medium": 1, "low": 2}[s])
    wa = next(i for i in q["items"] if i["category"] == "whatsapp")
    assert wa["severity"] == "high" and wa["link"].endswith(f"/isletmeler/{shop2.tenant.id}")
