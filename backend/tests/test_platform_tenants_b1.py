"""Platform Aşama B-1: sayfalı işletme listesi, kurulum kontrolü, not, sahip yönetimi."""
from datetime import date, time

from sqlalchemy import delete, select

from app.core.database import SessionFactory
from app.models.audit_log import AuditLog
from app.models.service import Service
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.models.tenant_settings import TenantSettings
from app.models.working_hours import WorkingHours
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

URL = "/api/platform/tenants"


async def tok(platform_admin):
    return mint_platform_token(platform_admin)


async def audit_rows(action):
    async with SessionFactory() as db:
        return (await db.execute(select(AuditLog).where(AuditLog.action == action))).scalars().all()


async def seed(n=3):
    """n boş işletme (sahipli): a-shop, b-shop..."""
    out = []
    for i in range(n):
        t = await make_tenant(f"shop-{chr(97 + i)}", name=f"Berber {chr(65 + i)}")
        o = await make_staff(t.id, "Ali", f"Soyad{i}", f"55511{20001 + i}", RoleType.SUPER_ADMIN)
        out.append((t, o))
    return out


# ------------------------------------------------------------------ liste
async def test_pagination_total_offset(api, platform_admin):
    await seed(5)
    t = await tok(platform_admin)
    r = (await api.get(URL, token=t, params={"limit": 2, "offset": 0, "sort": "name"})).json()
    assert r["total"] == 5 and r["limit"] == 2 and r["offset"] == 0
    assert [i["name"] for i in r["items"]] == ["Berber A", "Berber B"]
    r = (await api.get(URL, token=t, params={"limit": 2, "offset": 4, "sort": "name"})).json()
    assert [i["name"] for i in r["items"]] == ["Berber E"] and r["total"] == 5
    assert (await api.get(URL, token=t, params={"limit": 101})).status_code == 422
    assert (await api.get(URL, token=t, params={"sort": "bogus"})).status_code == 422


async def test_search_fields_and_wildcards(api, platform_admin):
    (ta, oa), (tb, ob), _ = await seed(3)
    await make_tenant("x-100pct", name="Yuzde%Berber")
    await make_tenant("alt-cizgi", name="Alt_Cizgi")
    await make_tenant("plainname", name="Plain")
    t = await tok(platform_admin)

    async def names(q):
        return sorted(i["name"] for i in (await api.get(URL, token=t, params={"search": q})).json()["items"])

    assert await names("berber b") == ["Berber B"]
    assert await names("shop-c") == ["Berber C"]  # slug
    assert await names("Soyad1") == ["Berber B"]  # sahip adı soyadı
    assert await names("ali soyad0") == ["Berber A"]
    assert await names("5551120002") == ["Berber B"]  # sahip telefonu
    assert await names("%") == ["Yuzde%Berber"]  # joker kaçırılır
    assert await names("_") == ["Alt_Cizgi"]
    assert await names("zzz") == []


async def test_status_filter(api, platform_admin):
    await seed(2)
    await make_tenant("passive", active=False)
    s = await make_tenant("susp")
    async with SessionFactory() as db:
        from datetime import datetime
        tt = await db.get(Tenant, s.id)
        tt.is_active = False
        tt.auto_suspended_at = datetime.now()
        await db.commit()
    t = await tok(platform_admin)

    async def slugs(st):
        return sorted(i["slug"] for i in (await api.get(URL, token=t, params={"status": st})).json()["items"])

    assert len(await slugs("all")) == 4
    assert await slugs("active") == ["shop-a", "shop-b"]
    assert await slugs("inactive") == ["passive", "susp"]
    assert await slugs("suspended") == ["susp"]


async def test_sorting(api, platform_admin):
    (ta, _), (tb, _), (tc, _) = await seed(3)
    sh = await make_shop("zz-shop")  # 3 personel, randevu yok
    c = await make_customer(tb.id, "5559990000")
    s = await make_staff(tb.id, "Bir", "Berber", "5559990001")
    sv = await make_service(tb.id, "Kesim")
    await make_appointment(tb.id, c.id, s.id, sv.id, date(2030, 1, 1), time(10, 0))
    t = await tok(platform_admin)

    async def order(sort):
        return [i["slug"] for i in (await api.get(URL, token=t, params={"sort": sort})).json()["items"]]

    assert (await order("name"))[0] == "shop-a" and (await order("-name"))[0] == "zz-shop"
    assert (await order("-staff"))[0] == "zz-shop" and (await order("staff"))[-1] == "zz-shop"
    assert (await order("-appointments"))[0] == "shop-b"
    assert (await order("-created"))[0] == "zz-shop" and (await order("created"))[0] == "shop-a"
    assert (await order("-created")) == list(reversed(await order("created")))


async def test_options_endpoint(api, platform_admin, shop):
    await make_tenant("aaa", name="Aaa")
    t = await tok(platform_admin)
    r = (await api.get(f"{URL}/options", token=t)).json()
    assert [o["name"] for o in r][0] == "Aaa" and set(r[0]) == {"id", "name", "slug"} and len(r) == 2
    assert (await api.get(f"{URL}/options")).status_code == 401
    assert (await api.get(f"{URL}/options", token=shop.owner_token)).status_code == 401


# ------------------------------------------------------------------ kurulum
async def setup_of(api, platform_admin, tenant_id):
    r = await api.get(f"{URL}/{tenant_id}", token=await tok(platform_admin))
    s = r.json()["setup"]
    return s, {c["key"]: c["ok"] for c in s["checks"]}


async def test_setup_ready_shop(api, platform_admin, shop):
    s, ok = await setup_of(api, platform_admin, shop.tenant.id)
    assert ok == {"services": True, "staff": True, "working_hours": True, "staff_services": True,
                  "address": True, "first_appointment": False}
    assert s["ready"] is True and s["missing_count"] == 1
    assert all(c["label"] and c["hint"] for c in s["checks"])
    # liste de aynı bilgiyi taşır
    item = (await api.get(URL, token=await tok(platform_admin))).json()["items"][0]
    assert item["setup"]["ready"] is True


async def test_setup_empty_tenant(api, platform_admin):
    t = await make_tenant("bos")
    s, ok = await setup_of(api, platform_admin, t.id)
    assert ok["services"] is False and ok["staff"] is False
    assert ok["working_hours"] is False and ok["staff_services"] is False
    assert s["ready"] is False and ok["address"] is True


async def test_setup_each_missing_case(api, platform_admin):
    # hizmet yok
    sh = await make_shop("no-svc")
    async with SessionFactory() as db:
        await db.execute(delete(Service).where(Service.tenant_id == sh.tenant.id))
        await db.commit()
    s, ok = await setup_of(api, platform_admin, sh.tenant.id)
    assert ok["services"] is False and ok["staff_services"] is False and s["ready"] is False

    # bir berberin çalışma saati yok
    sh = await make_shop("no-hours", phone_offset=10)
    async with SessionFactory() as db:
        await db.execute(delete(WorkingHours).where(WorkingHours.staff_id == sh.staff2.id))
        await db.commit()
    s, ok = await setup_of(api, platform_admin, sh.tenant.id)
    assert ok["working_hours"] is False and ok["services"] and ok["staff_services"] and s["ready"] is False

    # teknik destek berberlik saymaz; berber hizmeti pasif hizmetten ibaretse eksik
    sh = await make_shop("inactive-svc", phone_offset=20)
    async with SessionFactory() as db:
        for sv in (sh.cut, sh.cut_beard):
            (await db.get(Service, sv.id)).is_active = False
        await db.commit()
        db.add(Service(tenant_id=sh.tenant.id, name="Aktif", price=1, duration_min=30))
        await db.commit()
    s, ok = await setup_of(api, platform_admin, sh.tenant.id)
    assert ok["services"] is True and ok["staff_services"] is False and s["ready"] is False

    sh = await make_shop("tech", phone_offset=30)
    await make_staff(sh.tenant.id, "Teknik", "Destek", "5558880000", RoleType.TECHNICAL_SUPPORT)
    s, ok = await setup_of(api, platform_admin, sh.tenant.id)
    assert ok["working_hours"] and ok["staff_services"] and s["ready"] is True

    # adres boş: bilgilendirici, hazır olmayı etkilemez
    sh = await make_shop("no-addr", phone_offset=40)
    async with SessionFactory() as db:
        ts = (await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == sh.tenant.id))).scalar_one()
        ts.business_adress = "  "
        await db.commit()
    s, ok = await setup_of(api, platform_admin, sh.tenant.id)
    assert ok["address"] is False and s["ready"] is True

    # ilk randevu
    sh = await make_shop("appt", phone_offset=50)
    c = await make_customer(sh.tenant.id, "5559990000")
    await make_appointment(sh.tenant.id, c.id, sh.staff.id, sh.cut.id, date(2030, 1, 1), time(10, 0))
    _, ok = await setup_of(api, platform_admin, sh.tenant.id)
    assert ok["first_appointment"] is True


# ------------------------------------------------------------------ not
async def test_note_update_audit_hides_text(api, platform_admin, shop):
    t = await tok(platform_admin)
    url = f"{URL}/{shop.tenant.id}"
    r = await api.patch(url, token=t, json={"note": "  Çok gizli not 123  "})
    assert r.status_code == 200 and r.json()["note"] == "Çok gizli not 123"
    assert (await api.get(url, token=t)).json()["note"] == "Çok gizli not 123"
    await api.patch(url, token=t, json={"note": "Çok gizli not 123"})  # değişmedi
    rows = await audit_rows("tenant.note_update")
    assert len(rows) == 1
    assert "gizli" not in str(rows[0].details) and "gizli" not in rows[0].summary
    out = (await api.get("/api/platform/audit", token=t, params={"action": "tenant.note_update"})).text
    assert "gizli" not in out
    assert (await api.patch(url, token=t, json={"note": ""})).json()["note"] is None
    assert len(await audit_rows("tenant.note_update")) == 2
    assert (await api.patch(url, token=t, json={"note": "x" * 2001})).status_code == 422
    assert (await api.patch(url, token=t, json={"name": "Yeni"})).json()["note"] is None  # not'a dokunmaz


# ------------------------------------------------------------------ sahip
async def test_detail_owner(api, platform_admin, shop):
    t = await tok(platform_admin)
    r = (await api.get(f"{URL}/{shop.tenant.id}", token=t)).json()
    assert r["owner"] == {"id": shop.owner.id, "name": "Sahip", "surname": "Patron", "phone": shop.owner.phone}
    assert (await api.get(f"{URL}/99999", token=t)).status_code == 404
    assert (await api.get(f"{URL}/{shop.tenant.id}")).status_code == 401


async def test_owner_edit(api, platform_admin, shop):
    t = await tok(platform_admin)
    url = f"{URL}/{shop.tenant.id}/owner"
    r = await api.patch(url, token=t, json={"name": "mehmet ALİ", "surname": "öztürk"})
    assert r.status_code == 200 and r.json()["owner"]["name"] == "Mehmet Ali" and r.json()["owner"]["surname"] == "Öztürk"
    # çakışan telefon
    r = await api.patch(url, token=t, json={"phone": shop.staff.phone})
    assert r.status_code == 409 and r.json()["detail"] == "Bu telefon numarası zaten kayıtlı"
    assert (await api.patch(url, token=t, json={"phone": "123"})).status_code == 422
    # başka işletmede aynı telefon serbest
    other = await make_shop("other", phone_offset=100)
    r = await api.patch(f"{URL}/{other.tenant.id}/owner", token=t, json={"phone": shop.owner.phone})
    assert r.status_code == 200
    # telefon değişimi
    r = await api.patch(url, token=t, json={"phone": "5329998877"})
    assert r.status_code == 200 and r.json()["owner"]["phone"] == "5329998877"
    async with SessionFactory() as db:
        assert (await db.get(Staff, shop.owner.id)).token_version == 1
    rows = await audit_rows("tenant.owner_update")
    assert len(rows) == 3 and not any("password" in str(r.details) for r in rows)
    assert (await api.patch(f"{URL}/99999/owner", token=t, json={"name": "A"})).status_code == 404


async def test_owner_reset_password(api, platform_admin, shop):
    t = await tok(platform_admin)
    url = f"{URL}/{shop.tenant.id}/owner/reset-password"
    # üretilen
    r = await api.post(url, token=t)
    assert r.status_code == 200
    pw = r.json()["password"]
    assert len(pw) == 10 and not set(pw) & set("0O1lI")
    assert (await api.get("/api/admin/staff", slug=shop.slug, token=shop.owner_token)).status_code == 401
    login = await api.post("/api/auth/login", slug=shop.slug, json={"phone": shop.owner.phone, "password": pw})
    assert login.status_code == 200
    assert (await api.post("/api/auth/login", slug=shop.slug,
                           json={"phone": shop.owner.phone, "password": PASSWORD})).status_code == 401
    # verilen
    r = await api.post(url, token=t, json={"password": "yeni-sifre-77"})
    assert r.json()["password"] == "yeni-sifre-77"
    assert (await api.post("/api/auth/login", slug=shop.slug,
                           json={"phone": shop.owner.phone, "password": "yeni-sifre-77"})).status_code == 200
    assert (await api.post(url, token=t, json={"password": "12345"})).status_code == 422
    assert (await api.post(f"{URL}/99999/owner/reset-password", token=t)).status_code == 404
    assert (await api.post(url)).status_code == 401
    # şifre hiçbir yerde yok
    rows = await audit_rows("tenant.owner_password_reset")
    assert len(rows) == 2
    for row in rows:
        blob = f"{row.summary} {row.details} {row.actor_label}"
        assert pw not in blob and "yeni-sifre-77" not in blob
    out = (await api.get("/api/platform/audit", token=t, params={"limit": 200})).text
    assert pw not in out and "yeni-sifre-77" not in out
