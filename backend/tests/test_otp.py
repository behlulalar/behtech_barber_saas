"""OTP: rastgele kod, 5 yanlış -> kilit, 60 sn aralık, tek kullanımlık doğru kod."""
import re
from datetime import datetime, timedelta

from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.verification_code import VerificationCode
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

PHONE = "5551234567"


async def send(api, phone=PHONE, slug="alfa"):
    return await api.post("/api/auth/send-code", slug=slug, json={"phone": phone})


async def verify(api, code, phone=PHONE, slug="alfa"):
    return await api.post("/api/auth/verify-code", slug=slug, json={"phone": phone, "code": code})


async def test_code_is_random_six_digits_when_no_fixed_code(api, shop):
    assert not settings.otp_fixed_code  # test ortamı: sabit kod yok
    codes = []
    for i in range(6):
        r = await send(api, phone=f"555000000{i}")
        assert r.status_code == 200, r.text
        codes.append(r.json()["dev_code"])
    assert all(re.fullmatch(r"\d{6}", c) for c in codes)
    assert len(set(codes)) > 1          # hepsi aynı sabit kod değil
    assert "123456" not in codes or len(set(codes)) > 1


async def test_fixed_code_only_honoured_in_development(api, shop, monkeypatch):
    monkeypatch.setattr(settings, "otp_fixed_code", "123456")
    assert (await send(api, "5550000001")).json()["dev_code"] == "123456"
    # production'da sabit kod yok sayılır ve dev_code sızdırılmaz
    monkeypatch.setattr(settings, "environment", "production")

    async def _no_delivery(phone, text):  # gerçek Evolution'a gitme
        return None

    monkeypatch.setattr("app.api.public.deliver_code", _no_delivery)
    r = await send(api, "5550000002")
    assert r.status_code == 200 and r.json()["dev_code"] is None
    async with SessionFactory() as db:
        row = (await db.execute(select(VerificationCode).where(VerificationCode.phone == "5550000002"))).scalar_one()
        assert row.code != "123456" or re.fullmatch(r"\d{6}", row.code)  # rastgele üretildi
        assert re.fullmatch(r"\d{6}", row.code)


async def test_invalid_phone_rejected(api, shop):
    for bad in ("123", "4551234567", "55512345678", "abcdefghij"):
        assert (await send(api, bad)).status_code == 422


async def test_correct_code_returns_customer_token_and_is_single_use(api, shop):
    code = (await send(api)).json()["dev_code"]
    r = await verify(api, code)
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["customer"] is None  # ilk kez: müşteri kaydı yok
    # token müşteri token'ıdır, bu tenant'a bağlı
    me = await api.get("/api/customer/appointments", slug="alfa", token=body["access_token"])
    assert me.status_code == 200
    # aynı kod ikinci kez kullanılamaz
    r2 = await verify(api, code)
    assert r2.status_code == 400


async def test_known_customer_is_returned_on_verify(api, shop):
    await make_customer(shop.tenant.id, PHONE, "Ayse", "Yilmaz")
    code = (await send(api)).json()["dev_code"]
    r = await verify(api, code)
    assert r.json()["customer"] == {"name": "Ayse", "surname": "Yilmaz"}


async def test_wrong_code_rejected_then_right_code_still_works(api, shop):
    code = (await send(api)).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    assert (await verify(api, wrong)).status_code == 400
    assert (await verify(api, code)).status_code == 200


async def test_five_wrong_attempts_lock_the_code(api, shop):
    code = (await send(api)).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for i in range(4):
        r = await verify(api, wrong)
        assert r.status_code == 400 and "Çok fazla" not in r.json()["detail"]
    r = await verify(api, wrong)  # 5. yanlış
    assert r.status_code == 400 and "Çok fazla hatalı deneme" in r.json()["detail"]
    # kilit sonrası DOĞRU kod bile geçmez
    r = await verify(api, code)
    assert r.status_code == 400


async def test_new_code_after_lock_works_after_gap(api, shop):
    code = (await send(api)).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        await verify(api, wrong)
    # 60 sn aralığı simüle et: eski kaydın created_at'ini geriye çek
    async with SessionFactory() as db:
        await db.execute(text("update verification_codes set created_at = now() - interval '2 minutes'"))
        await db.commit()
    new = (await send(api)).json()["dev_code"]
    assert (await verify(api, new)).status_code == 200


async def test_resend_within_60_seconds_blocked(api, shop):
    assert (await send(api)).status_code == 200
    r = await send(api)
    assert r.status_code == 429 and "60 saniye" in r.json()["detail"]
    # başka telefon etkilenmez
    assert (await send(api, "5559998877")).status_code == 200
    # başka işletmedeki aynı telefon da etkilenmez
    await make_shop("beta")
    assert (await send(api, PHONE, slug="beta")).status_code == 200


async def test_resend_allowed_after_gap_but_capped_at_three_per_ten_minutes(api, shop):
    async def age_codes():
        async with SessionFactory() as db:
            await db.execute(text("update verification_codes set created_at = created_at - interval '2 minutes'"))
            await db.commit()

    for _ in range(3):
        assert (await send(api)).status_code == 200
        await age_codes()
    r = await send(api)
    assert r.status_code == 429 and "dakika" in r.json()["detail"]


async def test_expired_code_rejected(api, shop):
    code = (await send(api)).json()["dev_code"]
    async with SessionFactory() as db:
        await db.execute(text("update verification_codes set expires_at = now() - interval '1 minute'"))
        await db.commit()
    assert (await verify(api, code)).status_code == 400


async def test_code_is_scoped_to_tenant_and_phone(api, shop, shop2):
    code = (await send(api)).json()["dev_code"]
    assert (await verify(api, code, slug="beta")).status_code == 400            # başka işletme
    assert (await verify(api, code, phone="5550000000")).status_code == 400     # başka telefon
    assert (await verify(api, code)).status_code == 200
