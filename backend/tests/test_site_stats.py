"""Tanıtım sitesi sayacı: çerezsiz günlük toplamlar."""
from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.site_stat import SiteStat
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def test_hits_count_up_and_are_visible_to_platform_only(api, platform_admin, shop):
    for ev in ("view", "view", "view", "trial_click", "demo_click"):
        assert (await api.post("/api/public/site-hit", json={"event": ev})).status_code == 204
    tok = mint_platform_token(platform_admin)
    r = await api.get("/api/platform/site-stats?days=7", token=tok)
    assert r.status_code == 200, r.text
    d = r.json()
    assert (d["view"], d["trial_click"], d["demo_click"]) == (3, 1, 1)
    assert len(d["days"]) == 7 and d["days"][-1]["view"] == 3  # son gün bugün
    assert d["signups"] == 0
    # işletme paneli token'ı platform sayaçlarını göremez
    assert (await api.get("/api/platform/site-stats", token=shop.owner_token)).status_code == 401
    assert (await api.get("/api/platform/site-stats")).status_code == 401


async def test_only_known_events_and_no_personal_data(api):
    assert (await api.post("/api/public/site-hit", json={"event": "hack"})).status_code == 422
    assert (await api.post("/api/public/site-hit", json={})).status_code == 422
    assert (await api.post("/api/public/site-hit", json={"event": "view"}, headers={"user-agent": "Mozilla/5.0 (x)"})).status_code == 204
    async with SessionFactory() as db:
        cols = {c.name for c in SiteStat.__table__.columns}
        assert cols == {"day", "event", "count"}  # IP, user-agent, kimlik sütunu yok
        assert (await db.execute(select(SiteStat.count))).scalar_one() == 1
