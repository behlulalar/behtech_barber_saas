"""İşletme iletişim bilgileri: panelden düzenleme, normalize etme ve herkese açık gösterim."""
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


def _body(**kw):
    return {"business_name": "Alfa", **kw}


async def test_owner_sets_and_public_site_shows_contact(api, shop):
    r = await api.put("/api/admin/settings", slug="alfa", token=shop.owner_token,
                      json=_body(contact_phone="0555 123 45 67", whatsapp_phone="+90 532 111 22 33",
                                 instagram="https://www.instagram.com/Berber.Ali/?hl=tr"))
    assert r.status_code == 200, r.text
    assert r.json()["contact_phone"] == "5551234567"
    assert r.json()["whatsapp_phone"] == "5321112233"
    assert r.json()["instagram"] == "berber.ali"
    pub = (await api.get("/api/public/tenant", slug="alfa")).json()
    assert (pub["contact_phone"], pub["whatsapp_phone"], pub["instagram"]) == ("5551234567", "5321112233", "berber.ali")


async def test_landline_accepted_and_empty_clears(api, shop):
    r = await api.put("/api/admin/settings", slug="alfa", token=shop.owner_token,
                      json=_body(contact_phone="(0212) 555 12 34", instagram="@usta"))
    assert r.json()["contact_phone"] == "2125551234" and r.json()["instagram"] == "usta"
    r = await api.put("/api/admin/settings", slug="alfa", token=shop.owner_token,
                      json=_body(contact_phone="", whatsapp_phone=None, instagram="  "))
    assert r.status_code == 200
    assert r.json()["contact_phone"] is None and r.json()["instagram"] is None


async def test_invalid_values_rejected(api, shop):
    for bad in ({"contact_phone": "12345"}, {"whatsapp_phone": "9999999999"}, {"instagram": "bu bir isim değil!"},
                {"instagram": "a" * 31}):
        r = await api.put("/api/admin/settings", slug="alfa", token=shop.owner_token, json=_body(**bad))
        assert r.status_code == 422, (bad, r.status_code)


async def test_staff_cannot_edit_contact(api, shop):
    r = await api.put("/api/admin/settings", slug="alfa", token=shop.staff_token, json=_body(instagram="x"))
    assert r.status_code == 403
