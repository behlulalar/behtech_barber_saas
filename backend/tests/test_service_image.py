"""Hizmet görseli: yükleme, sıkı boyut sınırı, kaldırma, müşteri listesinde görünme."""
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

PNG = "data:image/png;base64," + "A" * 200


async def _create(api, shop, **extra):
    return await api.post("/api/admin/services", slug="alfa", token=shop.owner_token,
                          json={"name": "Saç + Sakal", "price": 500, "duration_min": 60, **extra})


async def test_service_image_roundtrip_and_public_list(api, shop):
    r = await _create(api, shop, image=PNG)
    assert r.status_code == 201 and r.json()["image"] == PNG
    pub = (await api.get("/api/services", slug="alfa")).json()
    assert any(s["name"] == "Saç + Sakal" and s["image"] == PNG for s in pub)


async def test_service_without_image_is_null(api, shop):
    assert (await _create(api, shop)).json()["image"] is None


async def test_service_image_validation(api, shop):
    assert (await _create(api, shop, image="http://x/y.png")).status_code == 422
    assert (await _create(api, shop, image="data:image/png;base64," + "A" * 400_100)).status_code == 422


async def test_service_image_update_and_remove(api, shop):
    sid = (await _create(api, shop, image=PNG)).json()["id"]
    r = await api.patch(f"/api/admin/services/{sid}", slug="alfa", token=shop.owner_token, json={"price": 600})
    assert r.status_code == 200 and r.json()["image"] == PNG  # görsele dokunulmadı
    r = await api.patch(f"/api/admin/services/{sid}", slug="alfa", token=shop.owner_token, json={"image": ""})
    assert r.status_code == 200 and r.json()["image"] is None
