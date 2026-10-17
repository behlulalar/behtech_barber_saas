"""KVKK araçları: işletme verisi dışa aktarma (ZIP) ve silme (anonimleştirme, muhasebe kaydı korunur)."""
import io
import zipfile
from datetime import date

from sqlalchemy import select, update

from app.core import media
from app.core.database import SessionFactory
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.consent_record import ConsentRecord
from app.models.customer import Customers
from app.models.payment import Payment
from app.models.service import Service
from app.models.staff import Staff
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from tests.factories import *  # noqa
from tests.helpers import *  # noqa
from tests.test_media import data_url, png


async def seed(shop):
    c = await make_customer(shop.tenant.id, "5321110000", "Ayşe", "Yılmaz")
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, tomorrow(), time(11, 0))
    async with SessionFactory() as db:
        db.add(Payment(tenant_id=shop.tenant.id, amount=1500, paid_on=date.today()))
        db.add(Subscription(tenant_id=shop.tenant.id, plan_name="Aylık", start_date=date.today(), end_date=date.today(), price=1500))
        db.add(ConsentRecord(kind="customer_privacy", version="1", tenant_id=shop.tenant.id, phone="5321110000"))
        db.add(ConsentRecord(kind="tenant_terms", version="1", tenant_id=shop.tenant.id, phone=shop.owner.phone))
        await db.commit()


async def test_export_zip_contains_customer_and_business_data_without_secrets(api, platform_admin, shop):
    await seed(shop)
    r = await api.get(f"/api/platform/tenants/{shop.tenant.id}/export", token=mint_platform_token(platform_admin))
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip" and "attachment" in r.headers["content-disposition"]
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert {"isletme.csv", "personel.csv", "musteriler.csv", "randevular.csv", "odemeler.csv", "OKUBENI.txt"} <= set(z.namelist())
    cust = z.read("musteriler.csv").decode("utf-8")
    assert "Ayşe;Yılmaz;5321110000" in cust
    allcsv = " ".join(z.read(n).decode("utf-8") for n in z.namelist())
    assert "$2b$" not in allcsv and "password" not in allcsv.lower()  # parola karması yok
    assert "1500" in z.read("odemeler.csv").decode("utf-8")
    async with SessionFactory() as db:
        assert (await db.execute(select(AuditLog).where(AuditLog.action == "tenant.export"))).scalar_one()
    assert (await api.get(f"/api/platform/tenants/{shop.tenant.id}/export", token=shop.owner_token)).status_code == 401


async def test_erase_requires_inactive_and_slug_confirmation(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    url = f"/api/platform/tenants/{shop.tenant.id}/erase"
    assert (await api.post(url, token=tok, json={"confirm_slug": shop.slug})).status_code == 409  # aktif
    async with SessionFactory() as db:
        await db.execute(update(Tenant).where(Tenant.id == shop.tenant.id).values(is_active=False))
        await db.commit()
    assert (await api.post(url, token=tok, json={"confirm_slug": "yanlis"})).status_code == 400
    assert (await api.post(url, token=shop.owner_token, json={"confirm_slug": shop.slug})).status_code == 401


async def test_erase_deletes_personal_data_keeps_accounting_and_other_tenants(api, platform_admin, shop, shop2):
    await seed(shop)
    other = await make_customer(shop2.tenant.id, "5329990000", "Başka", "Kişi")
    img = (await api.patch(f"/api/admin/staff/{shop.staff.id}", slug=shop.slug, token=shop.owner_token,
                           json={"photo_image": data_url(png(shade=77))})).json()["photo_image"]
    fpath = media.file_for(img.removeprefix(media.PREFIX))
    assert fpath is not None
    async with SessionFactory() as db:
        await db.execute(update(Tenant).where(Tenant.id == shop.tenant.id).values(is_active=False))
        await db.commit()
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/erase", token=mint_platform_token(platform_admin), json={"confirm_slug": "ALFA"})
    assert r.status_code == 204, r.text
    tid = shop.tenant.id
    async with SessionFactory() as db:
        for model in (Customers, Appointment, Staff, Service):
            assert (await db.execute(select(model.id).where(model.tenant_id == tid))).first() is None, model
        assert (await db.execute(select(ConsentRecord.id).where(ConsentRecord.tenant_id == tid, ConsentRecord.kind == "customer_privacy"))).first() is None
        assert (await db.execute(select(ConsentRecord.id).where(ConsentRecord.tenant_id == tid, ConsentRecord.kind == "tenant_terms"))).first() is not None
        assert (await db.execute(select(Payment.id).where(Payment.tenant_id == tid))).first() is not None  # muhasebe kaydı korunur
        assert (await db.execute(select(Subscription.id).where(Subscription.tenant_id == tid))).first() is not None
        t = await db.get(Tenant, tid)
        assert t.name.startswith("Silinmiş işletme") and t.slug == f"silinmis-{tid}" and t.is_active is False
        assert (await db.execute(select(Customers.id).where(Customers.id == other.id))).first() is not None  # başka işletme etkilenmedi
        log = (await db.execute(select(AuditLog).where(AuditLog.action == "tenant.erase"))).scalar_one()
        assert "5321110000" not in log.summary and log.details["customers"] == 1
    assert not fpath.exists()  # başka kimse kullanmıyorsa görsel dosyası da silindi
    assert (await api.post(f"/api/platform/tenants/{tid}/erase", token=mint_platform_token(platform_admin), json={"confirm_slug": f"silinmis-{tid}"})).status_code == 409
