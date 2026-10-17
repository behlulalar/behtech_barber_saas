"""İşletmeden platforma destek talebi: oluşturma, sınırlar, yanıt (bildirim kutusuna düşer), kapatma."""
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def ask(api, shop, msg="WhatsApp bağlanmıyor, yardım eder misiniz?", category="whatsapp", token=None):
    return await api.post("/api/admin/support", slug=shop.slug, token=token or shop.owner_token, json={"category": category, "message": msg})


async def test_create_list_and_permissions(api, shop, shop2):
    r = await ask(api, shop)
    assert r.status_code == 201 and r.json()["status"] == "open" and r.json()["reply"] is None
    mine = (await api.get("/api/admin/support", slug=shop.slug, token=shop.owner_token)).json()
    assert [t["message"] for t in mine] == ["WhatsApp bağlanmıyor, yardım eder misiniz?"]
    assert (await api.get("/api/admin/support", slug=shop2.slug, token=shop2.owner_token)).json() == []  # başka işletme görmez
    assert (await ask(api, shop, token=shop.staff_token)).status_code == 403  # berber yazamaz
    assert (await ask(api, shop, msg="x")).status_code == 422  # çok kısa
    assert (await api.post("/api/admin/support", slug=shop.slug, json={"message": "merhaba dünya"})).status_code == 401


async def test_open_ticket_limit(api, shop):
    for _ in range(5):
        assert (await ask(api, shop)).status_code == 201
    assert (await ask(api, shop)).status_code == 429


async def test_platform_replies_and_tenant_gets_notification(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    tid = (await ask(api, shop)).json()["id"]
    lst = (await api.get("/api/platform/support?status=open", token=tok)).json()
    assert lst[0]["id"] == tid and lst[0]["tenant_name"] and lst[0]["staff_phone"] == shop.owner.phone
    q = (await api.get("/api/platform/actions", token=tok)).json()
    assert any(i["category"] == "support" for i in q["items"])
    r = await api.post(f"/api/platform/support/{tid}/reply", token=tok, json={"message": "Bağlantıyı yeniden kurun, olmazsa yazın."})
    assert r.status_code == 200 and r.json()["status"] == "closed" and r.json()["reply"].startswith("Bağlantıyı")
    inbox = (await api.get("/api/admin/inbox", slug=shop.slug, token=shop.owner_token)).json()
    assert any(i["title"] == "Destek talebinize yanıt" and "yeniden kurun" in i["body"] for i in inbox["items"])
    mine = (await api.get("/api/admin/support", slug=shop.slug, token=shop.owner_token)).json()
    assert mine[0]["status"] == "closed" and mine[0]["reply"]
    assert (await api.post(f"/api/platform/support/{tid}/reply", token=tok, json={"message": "tekrar"})).status_code == 409
    assert not any(i["category"] == "support" for i in (await api.get("/api/platform/actions", token=tok)).json()["items"])


async def test_close_without_reply_and_auth(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    tid = (await ask(api, shop)).json()["id"]
    assert (await api.post(f"/api/platform/support/{tid}/close", token=shop.owner_token)).status_code == 401
    r = await api.post(f"/api/platform/support/{tid}/close", token=tok)
    assert r.status_code == 200 and r.json()["status"] == "closed" and r.json()["reply"] is None
    assert (await api.post("/api/platform/support/999999/close", token=tok)).status_code == 404
    assert (await api.get("/api/platform/support?status=closed", token=tok)).json()[0]["id"] == tid
