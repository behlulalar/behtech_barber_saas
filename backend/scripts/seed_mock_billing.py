"""Platform paneli (abonelik/ödeme takibi) için sahte veri. Tekrar çalıştırılabilir; yalnızca geliştirme.

Kullanım:
    .venv/bin/python scripts/seed_mock_billing.py            # oluştur / yenile
    .venv/bin/python scripts/seed_mock_billing.py --reset    # bu script'in dönem+ödemelerini sil

Ne yapar:
  * eksik sahte dükkânları oluşturur (sahip: 5111111111 / 123456); içlerini doldurmak için ardından
    `scripts/seed_mock_data.py` çalıştırın
  * aşağıdaki dükkânlara her abonelik durumunu gösteren dönem ve ödeme kayıtları yazar
    (tarihler BUGÜNE göre hesaplanır, durumlar zamanla bozulmaz)
  * platform ayarlarında BOŞ olan IBAN/alıcı/banka alanlarını sahte değerlerle doldurur
`demo` dükkânına DOKUNMAZ (orada elle girilmiş kayıtlar olabilir); paket fiyatlarını da değiştirmez.
"""
import asyncio
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import settings  # noqa: E402
from app.core.database import SessionFactory, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.payment import Payment  # noqa: E402
from app.models.plan import Plan  # noqa: E402
from app.models.platform_settings import PlatformSettings  # noqa: E402
from app.models.staff import RoleType, Staff  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.tenant_settings import TenantSettings  # noqa: E402
from app.services.billing_services import period_end  # noqa: E402

NEW_SHOPS = {  # slug: (işletme adı, sahip adı, soyadı)
    "ustamakas": ("Usta Makas Berber", "Hakan", "Demirtaş"),
    "keskinberber": ("Keskin Berber", "Serdar", "Keskin"),
    "egekuafor": ("Ege Erkek Kuaförü", "Barış", "Egeli"),
    "merkezberber": ("Merkez Berber", "Tuncay", "Aydoğan"),
    "baslangic": ("Başlangıç Kuaför", "Mehmet", "Yaşar"),
    "yenigelen": ("Yeni Gelen Berber", "Cengiz", "Özdemir"),
}
# Aylık dönem: start..start+29 gün gibi davranan yardımcı (gerçek plan hesabı period_end ile)
D = timedelta

# Her dükkân için senaryo: (plan adı | None=özel, ay, başlangıç ofseti(gün, bugüne göre), fiyat | None=plan fiyatı,
#                          ödemeler [(tutar, başlangıçtan kaç gün sonra | "gün ofseti")], not)
# "monthly_end": bitişi bugüne göre verip başlangıcı geriye hesaplamak için ayrı alan.
SCENARIOS = {
    # aktif, yıllık, tam ödenmiş
    "sefapertev": [dict(plan="Yıllık", months=12, start=-227, pay=[("full", 0)])],
    # ek süre (grace): 4 gün önce bitti, kısmi ödeme, WhatsApp'tan hatırlatıldı
    "deneme": [
        dict(plan="Aylık", months=1, end=-34, pay=[("full", 0)]),
        dict(plan="Aylık", months=1, end=-4, pay=[(400, 0)], reminded_days_ago=1),
    ],
    # süresi dolmuş (henüz askıya alınmadı; "Kontrolleri çalıştır" askıya alır)
    "denemee": [dict(plan="Aylık", months=1, end=-25, pay=[("full", 0)])],
    # özel anlaşma: 24 ay, liste fiyatının altında, taksitli
    "ustamakas": [dict(plan=None, label="Özel anlaşma (2 yıllık)", months=24, start=-135, price=15000,
                       pay=[(7500, 0), (3750, 126)], note="2 yıllık özel anlaşma, liste fiyatının altında. 3 taksit: 7.500 + 3.750 + 3.750.")],
    # yeni başladı, 6 aylık, ödenmiş
    "keskinberber": [dict(plan="6 Aylık", months=6, start=-6, pay=[("full", 0)])],
    # yarın/5 gün sonra bitiyor ve ödenmemiş (bekleyen alacak)
    "egekuafor": [
        dict(plan="Aylık", months=1, end=-25, pay=[("full", 0)]),
        dict(plan="Aylık", months=1, end=5, pay=[]),
    ],
    # 2 gün kaldı (3 gün kala bildirimi kapsamında), ödenmiş
    "merkezberber": [
        dict(plan="Aylık", months=1, end=-28, pay=[("full", 0)]),
        dict(plan="Aylık", months=1, end=2, pay=[("full", 0)]),
    ],
    # henüz başlamamış (ileri tarihli)
    "baslangic": [dict(plan="Aylık", months=1, start=6, pay=[])],
    # yenigelen: hiç dönem yok → "takip dışı"
}
MOCK_IBAN = ("TR330006100519786457841326", "BehTech Labs", "Ziraat Bankası")  # sahte


def month_start_for_end(end: date, months: int) -> date:
    """Bitişi verilen, `months` aylık dönemin başlangıcı (period_end'in tersi; ay sonu kırpması yok sayılır)."""
    # period_end(start, m) = (start + m ay) - 1 gün  =>  start = (end + 1 gün) - m ay
    nxt = end + D(days=1)
    total = nxt.year * 12 + (nxt.month - 1) - months
    y, m = divmod(total, 12)
    import calendar
    return date(y, m + 1, min(nxt.day, calendar.monthrange(y, m + 1)[1]))


async def ensure_shops(db, pw_hash: str) -> list[str]:
    created = []
    for slug, (name, owner_n, owner_s) in NEW_SHOPS.items():
        if (await db.execute(select(Tenant.id).where(Tenant.slug == slug))).first():
            continue
        t = Tenant(name=name, slug=slug, is_active=True)
        db.add(t)
        await db.flush()
        db.add(TenantSettings(tenant_id=t.id, business_name=name, business_adress=""))
        db.add(Staff(tenant_id=t.id, name=owner_n, surname=owner_s, phone="5111111111", password=pw_hash,
                     role=RoleType.SUPER_ADMIN))
        created.append(slug)
    await db.flush()
    return created


async def seed(reset_only: bool) -> None:
    if settings.environment != "development":
        raise SystemExit("Yalnızca ENVIRONMENT=development iken çalışır.")
    today = date.today()
    async with SessionFactory() as db:
        slugs = list(SCENARIOS) + [s for s in NEW_SHOPS if s not in SCENARIOS]
        tenants = {t.slug: t for t in (await db.execute(select(Tenant).where(Tenant.slug.in_(slugs)))).scalars()}
        if not reset_only:
            created = await ensure_shops(db, hash_password("123456"))
            if created:
                print("oluşturulan dükkânlar:", ", ".join(created), "→ içlerini doldurmak için seed_mock_data.py çalıştırın")
                tenants = {t.slug: t for t in (await db.execute(select(Tenant).where(Tenant.slug.in_(slugs)))).scalars()}

        ids = [t.id for t in tenants.values()]
        await db.execute(delete(Payment).where(Payment.tenant_id.in_(ids)))
        await db.execute(delete(Subscription).where(Subscription.tenant_id.in_(ids)))
        if reset_only:
            await db.commit()
            print("sahte dönem ve ödemeler silindi")
            await engine.dispose()
            return

        plans = {p.name: p for p in (await db.execute(select(Plan))).scalars()}
        n_sub = n_pay = 0
        for slug, periods in SCENARIOS.items():
            tenant = tenants.get(slug)
            if tenant is None:
                continue
            for sc in periods:
                if "end" in sc:
                    end = today + D(days=sc["end"]); start = month_start_for_end(end, sc["months"])
                else:
                    start = today + D(days=sc["start"]); end = period_end(start, sc["months"])
                plan = plans.get(sc["plan"]) if sc["plan"] else None
                price = sc.get("price", plan.price if plan else 0)
                sub = Subscription(
                    tenant_id=tenant.id, plan_id=plan.id if plan else None,
                    plan_name=plan.name if plan else sc.get("label", "Özel anlaşma"),
                    start_date=start, end_date=end, price=price, note=sc.get("note"),
                    reminded_at=(datetime.now() - D(days=sc["reminded_days_ago"])) if "reminded_days_ago" in sc else None,
                )
                db.add(sub)
                await db.flush()
                n_sub += 1
                for amount, after_days in sc["pay"]:
                    db.add(Payment(tenant_id=tenant.id, subscription_id=sub.id,
                                   amount=price if amount == "full" else amount,
                                   paid_on=min(start + D(days=after_days), today), method="IBAN"))
                    n_pay += 1

        ps = (await db.execute(select(PlatformSettings).where(PlatformSettings.id == 1))).scalar_one_or_none()
        if ps is not None:
            ps.iban = ps.iban or MOCK_IBAN[0]
            ps.account_holder = ps.account_holder or MOCK_IBAN[1]
            ps.bank_name = ps.bank_name or MOCK_IBAN[2]
        await db.commit()
        print(f"{n_sub} sahte dönem, {n_pay} sahte ödeme yazıldı ({', '.join(s for s in SCENARIOS if s in tenants)})")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed("--reset" in sys.argv))
