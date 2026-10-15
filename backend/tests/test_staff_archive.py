"""Personel "işten ayrıldı" (arşiv): geçmiş korunur, giriş/rezervasyon kapanır."""
from datetime import date, time, timedelta

from sqlalchemy import text

from app.core.database import SessionFactory
from app.models.appointment import AppointmentStatus
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def _past_done(shop, staff=None):
    staff = staff or shop.staff
    c = await make_customer(shop.tenant.id, "5559990001")
    await make_appointment(shop.tenant.id, c.id, staff.id, shop.cut.id, date.today() - timedelta(days=3), time(10, 0),
                           AppointmentStatus.COMPLETED)
    return c


async def _deactivate(api, shop, staff, token=None):
    return await api.patch(f"/api/admin/staff/{staff.id}", slug=shop.slug, token=token or shop.owner_token,
                           json={"is_active": False})


async def test_deactivate_with_only_past_appointments_keeps_history(api, shop):
    await _past_done(shop)
    old_token = shop.staff_token
    r = await _deactivate(api, shop, shop.staff)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_active"] is False and body["left_at"] == date.today().isoformat()
    # açık oturum düşer, giriş kapanır
    assert (await api.get("/api/auth/me", slug=shop.slug, token=old_token)).status_code == 401
    r = await api.post("/api/auth/login", slug=shop.slug, json={"phone": shop.staff.phone, "password": PASSWORD})
    assert r.status_code == 403 and "pasif" in r.json()["detail"]
    # yanlış parola pasif hesabı belli etmez
    r = await api.post("/api/auth/login", slug=shop.slug, json={"phone": shop.staff.phone, "password": "yanlis-1"})
    assert r.status_code == 401
    # müşteri tarafında görünmez
    pub = (await api.get("/api/staff", slug=shop.slug)).json()
    assert shop.staff.id not in [s["id"] for s in pub]
    r = await api.get("/api/availability/slots", slug=shop.slug,
                      params={"staff_id": shop.staff.id, "service_id": shop.cut.id, "date": tomorrow().isoformat()})
    assert r.status_code == 400 and "Berber bulunamadı" in r.json()["detail"]
    # yönetici listesinde durur; gelir raporu geçmişi korur
    lst = (await api.get("/api/admin/staff", slug=shop.slug, token=shop.owner_token)).json()
    row = next(s for s in lst if s["id"] == shop.staff.id)
    assert row["is_active"] is False
    rep = (await api.get("/api/admin/reports/revenue", slug=shop.slug, token=shop.owner_token,
                         params={"period": "year"})).json()
    assert shop.staff.id in [b["staff_id"] for b in rep["by_staff"]]
    assert next(b for b in rep["by_staff"] if b["staff_id"] == shop.staff.id)["is_active"] is False
    rep2 = (await api.get("/api/admin/reports/revenue", slug=shop.slug, token=shop.owner_token,
                          params={"period": "year", "staff_id": shop.staff.id})).json()
    assert rep2["revenue"] == 200
    appts = (await api.get("/api/admin/appointments", slug=shop.slug, token=shop.owner_token,
                           params={"staff_id": shop.staff.id})).json()
    assert len(appts) == 1


async def test_booking_inactive_staff_rejected(api, shop):
    await _deactivate(api, shop, shop.staff)
    tok = mint_customer_token(shop.tenant.id, "5559990002")
    r = await api.post("/api/appointments", slug=shop.slug, token=tok, json={
        "staff_id": shop.staff.id, "service_id": shop.cut.id, "appointment_date": tomorrow().isoformat(),
        "appointment_time": "10:00", "name": "A", "surname": "B"})
    assert r.status_code == 400 and r.json()["detail"] == "Berber bulunamadı"


async def test_future_appointments_block_deactivation_then_reactivate(api, shop):
    c = await make_customer(shop.tenant.id, "5559990003")
    a = await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, tomorrow(), time(11, 0))
    r = await _deactivate(api, shop, shop.staff)
    assert r.status_code == 409 and "1 gelecek randevusu var" in r.json()["detail"]
    lst = (await api.get("/api/admin/staff", slug=shop.slug, token=shop.owner_token)).json()
    assert next(s for s in lst if s["id"] == shop.staff.id)["is_active"] is True
    # iptal edilince geçer
    await api.patch(f"/api/admin/appointments/{a.id}", slug=shop.slug, token=shop.owner_token, json={"status": "cancelled"})
    assert (await _deactivate(api, shop, shop.staff)).status_code == 200
    r = await api.patch(f"/api/admin/staff/{shop.staff.id}", slug=shop.slug, token=shop.owner_token, json={"is_active": True})
    assert r.status_code == 200 and r.json()["is_active"] is True and r.json()["left_at"] is None
    assert (await api.post("/api/auth/login", slug=shop.slug,
                           json={"phone": shop.staff.phone, "password": PASSWORD})).status_code == 200
    assert shop.staff.id in [s["id"] for s in (await api.get("/api/staff", slug=shop.slug)).json()]


async def test_cannot_deactivate_self_or_last_manager(api, shop):
    r = await _deactivate(api, shop, shop.owner)
    assert r.status_code == 400 and "Kendi hesabınızı" in r.json()["detail"]
    boss2 = await make_staff(shop.tenant.id, "Ikinci", "Yonetici", "5551110009", RoleType.SUPER_ADMIN)
    # İkinci yönetici varken sahip pasife alınabilir; "son yönetici" kuralı savunmacıdır
    # (işlemi yapan zaten aktif bir yönetici olduğundan normalde hep en az biri kalır).
    assert (await _deactivate(api, shop, shop.owner, token=mint_staff_token(boss2))).status_code == 200
    assert (await _deactivate(api, shop, boss2, token=mint_staff_token(boss2))).status_code == 400


async def test_staff_cannot_deactivate_and_staff_list_hides_inactive(api, shop):
    r = await _deactivate(api, shop, shop.staff2, token=shop.staff_token)
    assert r.status_code == 403
    await _deactivate(api, shop, shop.staff2)
    lst = (await api.get("/api/admin/staff", slug=shop.slug, token=shop.staff_token)).json()
    assert shop.staff2.id not in [s["id"] for s in lst]


async def test_delete_409_message_and_direct_sql_delete_blocked(api, shop):
    await _past_done(shop)
    r = await api.delete(f"/api/admin/staff/{shop.staff.id}", slug=shop.slug, token=shop.owner_token)
    assert r.status_code == 409 and "İşten ayrıldı" in r.json()["detail"]
    async with SessionFactory() as db:
        try:
            await db.execute(text("delete from staff where id = :i"), {"i": shop.staff.id})
            await db.commit()
            raised = False
        except Exception:
            await db.rollback()
            raised = True
    assert raised  # NO ACTION: randevusu olan personel satırı tek başına silinemez


async def test_tenant_delete_still_cascades(shop):
    await _past_done(shop)
    async with SessionFactory() as db:
        await db.execute(text("delete from tenants where id = :i"), {"i": shop.tenant.id})
        await db.commit()
        n = (await db.execute(text("select count(*) from appointments where tenant_id = :i"), {"i": shop.tenant.id})).scalar_one()
        s = (await db.execute(text("select count(*) from staff where tenant_id = :i"), {"i": shop.tenant.id})).scalar_one()
    assert n == 0 and s == 0


async def test_platform_staff_count_active_only(api, shop, platform_admin):
    await _deactivate(api, shop, shop.staff)
    r = await api.get("/api/platform/tenants", token=mint_platform_token(platform_admin))
    assert r.status_code == 200
    items = r.json()["items"] if isinstance(r.json(), dict) else r.json()
    assert next(t for t in items if t["slug"] == "alfa")["staff_count"] == 2
