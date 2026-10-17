"""Görsel depolama: data URL -> dosya, içerik adreslemesi, önbellek başlıkları, doğrulama."""
import base64
import struct
import zlib

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.service import Service
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


def png(w=4, h=4, shade=0) -> bytes:
    raw = b"".join(b"\x00" + bytes([shade, 80, 160]) * w for _ in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def data_url(raw: bytes, mime="image/png") -> str:
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


async def make_service_with_image(api, shop, raw):
    r = await api.post("/api/admin/services", slug=shop.slug, token=shop.owner_token,
                       json={"name": "Foto", "price": 100, "duration_min": 30, "image": data_url(raw)})
    assert r.status_code == 201, r.text
    return r.json()


async def test_upload_becomes_cached_file_and_public_lists_only_a_path(api, shop):
    raw = png()
    svc = await make_service_with_image(api, shop, raw)
    path = svc["image"]
    assert path.startswith("/api/media/") and path.endswith(".png") and len(path) < 80  # JSON artık şişmiyor
    pub = (await api.get("/api/services", slug=shop.slug)).json()
    assert [s["image"] for s in pub if s["name"] == "Foto"] == [path]
    r = await api.get(path, slug=shop.slug)
    assert r.status_code == 200 and r.content == raw and r.headers["content-type"] == "image/png"
    assert "immutable" in r.headers["cache-control"] and r.headers["x-content-type-options"] == "nosniff"
    # DB'de data URL kalmadı
    async with SessionFactory() as db:
        assert (await db.execute(select(Service.image).where(Service.id == svc["id"]))).scalar_one() == path


async def test_same_content_one_file_and_path_roundtrips_on_patch(api, shop):
    raw = png(shade=7)
    a = await make_service_with_image(api, shop, raw)
    r = await api.post("/api/admin/services", slug=shop.slug, token=shop.owner_token,
                       json={"name": "Foto2", "price": 100, "duration_min": 30, "image": data_url(raw)})
    assert r.json()["image"] == a["image"]  # içerik özeti aynı: tek dosya
    r = await api.patch(f"/api/admin/services/{a['id']}", slug=shop.slug, token=shop.owner_token, json={"price": 150, "image": a["image"]})
    assert r.status_code == 200 and r.json()["image"] == a["image"]  # panel yolu geri gönderince bozulmaz
    r = await api.patch(f"/api/admin/services/{a['id']}", slug=shop.slug, token=shop.owner_token, json={"image": ""})
    assert r.json()["image"] is None


async def test_rejects_fake_unknown_and_svg_images(api, shop):
    body = {"name": "X", "price": 1, "duration_min": 30}
    post = lambda img: api.post("/api/admin/services", slug=shop.slug, token=shop.owner_token, json={**body, "image": img})  # noqa: E731
    assert (await post(data_url(b"not an image at all"))).status_code == 422  # imza yok
    assert (await post("data:image/svg+xml;base64," + base64.b64encode(b"<svg onload=alert(1)/>").decode())).status_code == 422
    assert (await post("/api/media/" + "0" * 32 + ".png")).status_code == 422  # olmayan dosya
    assert (await post("/api/media/../../etc/passwd")).status_code == 422
    assert (await post("https://evil.example/x.png")).status_code == 422


async def test_media_route_blocks_traversal_and_unknown_names(api, shop):
    assert (await api.get("/api/media/" + "a" * 32 + ".png", slug=shop.slug)).status_code == 404
    assert (await api.get("/api/media/..%2f..%2fetc%2fpasswd", slug=shop.slug)).status_code == 404
    assert (await api.get("/api/media/readme.txt", slug=shop.slug)).status_code == 404


async def test_settings_and_staff_images_become_files(api, shop):
    raw = png(shade=21)
    r = await api.put("/api/admin/settings", slug=shop.slug, token=shop.owner_token,
                      json={"business_name": "Alfa", "logo_image": data_url(raw), "banner_image": data_url(png(shade=22))})
    assert r.status_code == 200, r.text
    assert r.json()["logo_image"].startswith("/api/media/") and r.json()["banner_image"].startswith("/api/media/")
    pub = (await api.get("/api/public/tenant", slug=shop.slug)).json()
    assert pub["logo_image"].startswith("/api/media/")
    r = await api.patch(f"/api/admin/staff/{shop.staff.id}", slug=shop.slug, token=shop.owner_token, json={"photo_image": data_url(raw)})
    assert r.status_code == 200 and r.json()["photo_image"] == pub["logo_image"]  # aynı içerik = aynı dosya
