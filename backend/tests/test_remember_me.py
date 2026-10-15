"""\"Beni hatırla\": işaretliyse uzun ömürlü token, değilse varsayılan süre."""
from datetime import datetime

import jwt

from app.core.config import settings
from tests.factories import *  # noqa
from tests.helpers import *  # noqa
from datetime import datetime  # noqa: E402,F811


def _exp_minutes(token: str) -> float:
    payload = jwt.decode(token, options={"verify_signature": False})
    return (payload["exp"] - datetime.now().timestamp()) / 60


async def test_staff_remember_issues_long_token(api, shop):
    body = {"phone": shop.owner.phone, "password": PASSWORD}
    short = await api.post("/api/auth/login", slug="alfa", json=body)
    long = await api.post("/api/auth/login", slug="alfa", json={**body, "remember": True})
    assert short.status_code == long.status_code == 200, short.text
    assert _exp_minutes(short.json()["access_token"]) <= settings.access_token_expire_minutes
    assert _exp_minutes(long.json()["access_token"]) > settings.access_token_expire_minutes * 10


async def test_platform_remember_issues_long_token(api, platform_admin):
    body = {"phone": platform_admin.phone, "password": PLATFORM_PASSWORD}
    short = await api.post("/api/platform/login", json=body)
    long = await api.post("/api/platform/login", json={**body, "remember": True})
    assert short.status_code == long.status_code == 200, short.text
    assert _exp_minutes(short.json()["access_token"]) <= settings.access_token_expire_minutes
    assert _exp_minutes(long.json()["access_token"]) > settings.access_token_expire_minutes * 10
