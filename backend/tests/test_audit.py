"""Denetim kaydı (audit_logs): yazma işlemleri kayıt bırakır, gizli veri sızmaz, filtre/sayfalama çalışır."""
import json
from datetime import date, datetime, timedelta

from sqlalchemy import select, text

from app.core.database import SessionFactory
from app.models.audit_log import AuditLog
from app.models.platform_settings import PlatformSettings
from app.models.subscription import Subscription
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()
IBAN1 = "TR330006100519786457841326"
IBAN2 = "TR120006200000000000000001"
SETTINGS = {"iban": None, "account_holder": "Ali Veli", "bank_name": "Banka", "reminder_days": 3, "grace_days": 7,
            "notify_email": "owner@example.com", "reminder_template": "Merhaba {x}", "overdue_template": "Gecikti {x}"}


async def rows(**eq):
    async with SessionFactory() as db:
        q = select(AuditLog).order_by(AuditLog.id)
        for k, v in eq.items():
            q = q.where(getattr(AuditLog, k) == v)
        return (await db.execute(q)).scalars().all()


async def actions():
    return [r.action for r in await rows()]


async def setup(api, platform_admin):
    return mint_platform_token(platform_admin)


async def test_catalog_endpoint(api, platform_admin):
    r = await api.get("/api/platform/audit/actions", token=mint_platform_token(platform_admin))
    cat = r.json()
    assert r.status_code == 200 and len(cat) >= 25
    assert all(set(c) == {"value", "label", "group"} for c in cat)
    values = {c["value"] for c in cat}
    for v in ("platform.login", "tenant.create", "plan.create", "payment.delete", "settings.update",
              "billing.run_checks", "billing.auto_suspend", "admin.password_reset"):
        assert v in values
    assert {c["group"] for c in cat} >= {"Hesap", "Yönetici", "İşletme", "Paket", "Abonelik", "Ödeme", "Ayarlar", "Sistem"}


async def test_audit_requires_platform_auth(api, shop):
    assert (await api.get("/api/platform/audit")).status_code == 401
    assert (await api.get("/api/platform/audit", token=shop.owner_token, slug="alfa")).status_code == 401


async def test_login_writes_audit_row(api, platform_admin):
    await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})
    r = (await rows(action="platform.login"))
    assert len(r) == 1 and r[0].actor_type == "platform_admin" and r[0].actor_id == platform_admin.id
    assert r[0].ip and PLATFORM_PHONE in r[0].actor_label
    # yanlış giriş kayıt bırakmaz (kilit tetiklenene kadar)
    await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": "yanlis-yanlis"})
    assert len(await rows(action="platform.login")) == 1


async def test_lockout_writes_login_locked_audit(api, platform_admin):
    for _ in range(5):
        await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": "yanlis-yanlis"})
    r = await rows(action="platform.login_locked")
    assert len(r) == 1 and r[0].actor_type == "system" and PLATFORM_PHONE in r[0].actor_label


async def test_tenant_operations_are_audited(api, platform_admin):
    t = mint_platform_token(platform_admin)
    c = (await api.post("/api/platform/tenants", token=t, json={
        "name": "Yeni", "slug": "yeni", "owner_name": "a", "owner_surname": "b",
        "owner_phone": "5321112233", "owner_password": "owner-pass-1"})).json()
    await api.patch(f"/api/platform/tenants/{c['id']}", token=t, json={"name": "Yeni Ad"})
    await api.patch(f"/api/platform/tenants/{c['id']}", token=t, json={"is_active": False})
    await api.patch(f"/api/platform/tenants/{c['id']}", token=t, json={"is_active": True})
    # değişiklik yok: ek kayıt yok
    await api.patch(f"/api/platform/tenants/{c['id']}", token=t, json={"name": "Yeni Ad", "is_active": True})
    assert await actions() == ["tenant.create", "tenant.rename", "tenant.deactivate", "tenant.activate"]
    for r in await rows():
        assert r.tenant_id == c["id"] and r.actor_id == platform_admin.id and r.summary
    rn = (await rows(action="tenant.rename"))[0]
    assert rn.details == {"from": "Yeni", "to": "Yeni Ad"}
    # owner şifresi hiçbir kayıtta yok
    assert "owner-pass-1" not in json.dumps([[r.summary, r.details] for r in await rows()], default=str)


async def test_plan_crud_audited(api, platform_admin):
    t = mint_platform_token(platform_admin)
    p = (await api.post("/api/platform/plans", token=t, json={"name": "Aylık", "duration_months": 1, "price": 900})).json()
    await api.patch(f"/api/platform/plans/{p['id']}", token=t, json={"price": 1000})
    await api.patch(f"/api/platform/plans/{p['id']}", token=t, json={"price": 1000})  # değişmedi
    await api.delete(f"/api/platform/plans/{p['id']}", token=t)
    assert await actions() == ["plan.create", "plan.update", "plan.delete"]
    upd = (await rows(action="plan.update"))[0]
    assert upd.details == {"changes": {"price": {"from": 900, "to": 1000}}}


async def test_subscription_and_payment_audited(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    s = (await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=t, json={
        "start_date": TODAY.isoformat(), "end_date": (TODAY + timedelta(days=29)).isoformat(), "price": 1000,
        "plan_name": "Özel", "initial_payment": {"amount": 100, "paid_on": TODAY.isoformat()}})).json()
    await api.patch(f"/api/platform/subscriptions/{s['id']}", token=t, json={"price": 1200})
    await api.post(f"/api/platform/subscriptions/{s['id']}/reminded", token=t)
    p = (await api.post("/api/platform/payments", token=t, json={
        "tenant_id": shop.tenant.id, "subscription_id": s["id"], "amount": 300, "paid_on": TODAY.isoformat()})).json()
    assert (await api.delete(f"/api/platform/payments/{p['id']}", token=t)).status_code == 204
    acts = await actions()
    for a in ("subscription.create", "payment.create", "subscription.update", "subscription.reminded", "payment.delete"):
        assert a in acts, a
    assert acts.count("payment.create") == 2  # ilk ödeme + 300
    for r in await rows():
        assert r.tenant_id == shop.tenant.id
    # dönemi sil (ödemesi olan önce silinmeli)
    pays = (await api.get(f"/api/platform/payments?tenant_id={shop.tenant.id}", token=t)).json()
    for pay in pays:
        await api.delete(f"/api/platform/payments/{pay['id']}", token=t)
    assert (await api.delete(f"/api/platform/subscriptions/{s['id']}", token=t)).status_code == 204
    assert "subscription.delete" in await actions()


async def test_settings_audit_only_on_real_change_and_never_leaks_iban(api, platform_admin):
    t = mint_platform_token(platform_admin)
    cur = (await api.get("/api/platform/settings", token=t)).json()
    body = {k: cur[k] for k in SETTINGS}
    # değişiklik yok -> kayıt yok
    assert (await api.put("/api/platform/settings", token=t, json=body)).status_code == 200
    assert await rows(action="settings.update") == []
    # IBAN + e-posta + şablon değişir
    body.update(iban=IBAN1, notify_email="gizli.adres@example.com", reminder_template="ÇOK-GİZLİ-ŞABLON {x}")
    assert (await api.put("/api/platform/settings", token=t, json=body)).status_code == 200
    r = await rows(action="settings.update")
    assert len(r) == 1
    assert set(r[0].details["changed_fields"]) == {"iban", "notify_email", "reminder_template"}
    blob = json.dumps([r[0].summary, r[0].details, r[0].actor_label], default=str)
    for secret in (IBAN1, IBAN1[-6:], "gizli.adres", "ÇOK-GİZLİ"):
        assert secret not in blob
    # IBAN tekrar değişir: yine yalnızca alan adı
    body["iban"] = IBAN2
    await api.put("/api/platform/settings", token=t, json=body)
    r = await rows(action="settings.update")
    assert len(r) == 2 and r[1].details == {"changed_fields": ["iban"]}
    # API çıktısında hiçbir kayıtta IBAN yok
    page = (await api.get("/api/platform/audit?limit=200", token=t)).text
    assert IBAN1 not in page and IBAN2 not in page


async def test_no_audit_row_contains_passwords_or_tokens(api, platform_admin):
    t = mint_platform_token(platform_admin)
    secret_pw = "Cok-Gizli-Sifre-42"
    r = await api.post("/api/platform/admins", token=t, json={"phone": "5321112233", "name": "N", "password": secret_pw})
    aid = r.json()["id"]
    await api.post(f"/api/platform/admins/{aid}/reset-password", token=t, json={"password": secret_pw + "x"})
    new = (await api.post("/api/platform/me/password", token=t,
                          json={"current_password": PLATFORM_PASSWORD, "new_password": secret_pw + "y"})).json()["access_token"]
    await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": secret_pw + "y"})
    dump = (await api.get("/api/platform/audit?limit=200", token=new)).text
    assert "Cok-Gizli" not in dump and new not in dump
    assert "bcrypt" not in dump and "$2b$" not in dump
    async with SessionFactory() as db:
        raw = (await db.execute(text("select coalesce(string_agg(summary || coalesce(details::text,'') || actor_label, ' '), '') from audit_logs"))).scalar_one()
    assert "Cok-Gizli" not in raw and "$2b$" not in raw


async def test_admin_operations_audited(api, platform_admin):
    t = mint_platform_token(platform_admin)
    a = (await api.post("/api/platform/admins", token=t, json={"phone": "5321112233", "password": "guclu-sifre-77"})).json()
    await api.patch(f"/api/platform/admins/{a['id']}", token=t, json={"name": "Yeni İsim"})
    await api.patch(f"/api/platform/admins/{a['id']}", token=t, json={"name": "Yeni İsim"})  # değişmedi
    await api.post(f"/api/platform/admins/{a['id']}/reset-password", token=t, json={"password": "baska-guclu-88"})
    await api.post("/api/platform/me/logout-all", token=t)
    t2 = (await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})).json()["access_token"]
    await api.delete(f"/api/platform/admins/{a['id']}", token=t2)
    acts = await actions()
    assert acts == ["admin.create", "admin.update", "admin.password_reset", "platform.logout_all", "platform.login", "admin.delete"]


async def test_run_checks_and_auto_suspend_audited_as_system(api, platform_admin, shop):
    async with SessionFactory() as db:
        db.add(Subscription(tenant_id=shop.tenant.id, plan_name="x", start_date=TODAY - timedelta(days=90),
                            end_date=TODAY - timedelta(days=60), price=100))
        await db.commit()
    t = mint_platform_token(platform_admin)
    await api.post("/api/platform/billing/run-checks", token=t)
    sus = await rows(action="billing.auto_suspend")
    assert len(sus) == 1 and sus[0].actor_type == "system" and sus[0].tenant_id == shop.tenant.id
    rc = await rows(action="billing.run_checks")
    assert len(rc) == 1 and rc[0].actor_id == platform_admin.id and rc[0].details["trigger"] == "manual"


async def test_failed_request_writes_no_audit(api, platform_admin):
    t = mint_platform_token(platform_admin)
    await api.post("/api/platform/plans", token=t, json={"name": "A", "duration_months": 1, "price": 1})
    before = len(await rows())
    assert (await api.post("/api/platform/plans", token=t, json={"name": "A", "duration_months": 1, "price": 2})).status_code == 409
    assert (await api.post("/api/platform/payments", token=t, json={
        "tenant_id": 999, "amount": 5, "paid_on": TODAY.isoformat()})).status_code == 404
    assert len(await rows()) == before


# ------------------------------------------------------------------ listeleme / filtre
async def seed_audit(n_a=5, n_b=3):
    async with SessionFactory() as db:
        base = datetime.now() - timedelta(days=10)
        for i in range(n_a):
            db.add(AuditLog(created_at=base + timedelta(minutes=i), actor_type="platform_admin", actor_id=1,
                            actor_label="Ali (5000000001)", action="payment.create", entity_type="payment", entity_id=i,
                            tenant_id=1, summary=f"Ödeme {i}"))
        for i in range(n_b):
            db.add(AuditLog(created_at=base + timedelta(days=5, minutes=i), actor_type="platform_admin", actor_id=2,
                            actor_label="Veli (5000000002)", action="tenant.rename", entity_type="tenant", entity_id=i,
                            tenant_id=2, summary=f"Ad %{i} 50_off değişti"))
        await db.commit()


async def listing(api, t, qs=""):
    r = await api.get(f"/api/platform/audit?{qs}", token=t)
    assert r.status_code == 200, r.text
    return r.json()


async def test_list_shape_ordering_and_pagination(api, platform_admin):
    t = mint_platform_token(platform_admin)
    await seed_audit()
    page = await listing(api, t, "limit=3&offset=0")
    assert page["total"] == 8 and page["limit"] == 3 and page["offset"] == 0 and len(page["items"]) == 3
    item = page["items"][0]
    assert set(item) == {"id", "created_at", "actor_type", "actor_id", "actor_label", "action", "action_label",
                         "entity_type", "entity_id", "tenant_id", "tenant_name", "summary", "details", "ip"}
    assert item["action"] == "tenant.rename" and item["action_label"] == "İşletme adı değişti"
    # created_at DESC
    stamps = [i["created_at"] for i in (await listing(api, t))["items"]]
    assert stamps == sorted(stamps, reverse=True)
    p2 = await listing(api, t, "limit=3&offset=3")
    p3 = await listing(api, t, "limit=3&offset=6")
    ids = [i["id"] for p in (page, p2, p3) for i in p["items"]]
    assert len(ids) == 8 and len(set(ids)) == 8
    assert (await listing(api, t, "limit=3&offset=100"))["items"] == []


async def test_limit_bounds(api, platform_admin):
    t = mint_platform_token(platform_admin)
    assert (await api.get("/api/platform/audit?limit=200", token=t)).status_code == 200
    assert (await api.get("/api/platform/audit?limit=201", token=t)).status_code == 422
    assert (await api.get("/api/platform/audit?limit=0", token=t)).status_code == 422
    assert (await api.get("/api/platform/audit?offset=-1", token=t)).status_code == 422


async def test_filters_action_group_tenant_actor(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    await seed_audit()
    assert (await listing(api, t, "action=payment.create"))["total"] == 5
    assert (await listing(api, t, "group=Ödeme"))["total"] == 5
    assert (await listing(api, t, "group=" + "İşletme"))["total"] == 3
    assert (await listing(api, t, "group=Yok"))["total"] == 0
    assert (await listing(api, t, "tenant_id=2"))["total"] == 3
    assert (await listing(api, t, "actor_id=1"))["total"] == 5
    assert (await listing(api, t, "action=payment.create&actor_id=2"))["total"] == 0
    p = await listing(api, t, "tenant_id=1")
    assert p["items"][0]["tenant_name"] == shop.tenant.name  # tenant 1 = alfa


async def test_filter_date_range(api, platform_admin):
    t = mint_platform_token(platform_admin)
    await seed_audit()
    d0 = (datetime.now() - timedelta(days=10)).date()
    only_a = await listing(api, t, f"date_from={d0}&date_to={d0}")
    assert only_a["total"] == 5 and all(i["action"] == "payment.create" for i in only_a["items"])
    d1 = d0 + timedelta(days=5)
    only_b = await listing(api, t, f"date_from={d1}&date_to={d1}")
    assert only_b["total"] == 3
    assert (await listing(api, t, f"date_from={d0}&date_to={d1}"))["total"] == 8
    assert (await listing(api, t, f"date_from={d1 + timedelta(days=1)}"))["total"] == 0


async def test_search_q_and_like_escaping(api, platform_admin):
    t = mint_platform_token(platform_admin)
    await seed_audit()
    assert (await listing(api, t, "q=ödeme"))["total"] == 5            # summary, büyük/küçük harf duyarsız
    assert (await listing(api, t, "q=Veli"))["total"] == 3             # actor_label
    assert (await listing(api, t, "q=%25"))["total"] == 3              # '%' tam karakter olarak (joker değil)
    assert (await listing(api, t, "q=_"))["total"] == 3                # '_' joker değil: yalnızca '50_off' içerenler
    assert (await listing(api, t, "q=50_off"))["total"] == 3
    assert (await listing(api, t, "q=50%25off"))["total"] == 0         # joker gibi davranmaz
    assert (await listing(api, t, "q=5_off"))["total"] == 0
    assert (await listing(api, t, "q=%5C"))["total"] == 0              # ters eğik çizgi
    assert (await listing(api, t, "q=   "))["total"] == 8              # boş arama = filtre yok
