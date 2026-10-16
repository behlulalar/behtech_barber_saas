"""WhatsApp mesaj metinleri. KISA ve öz. Her türde EN AZ 3 eşdeğer kalıp vardır; kalıplar dönüşümlü seçilir
(aynı dükkân + tür için art arda aynı kalıp seçilmez), böylece mesajlar birebir aynı görünmez (spam/ban riski azalır).
Bağlantı yalnızca gerektiğinde: karşılama ve iptal sonrası yeniden randevu. OTP, onay ve hatırlatmada link YOK."""
import random
from datetime import date, time

from app.core.config import settings

DAYS = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")
MONTHS = ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")

OTP = (
    "{shop} randevu doğrulama kodunuz: {code}. Kodu kimseyle paylaşmayın.",
    "{shop} için doğrulama kodunuz {code}. Bu kodu kimseyle paylaşmayın.",
    "Merhaba, {shop} randevunuz için kodunuz: {code}. Kodu başkasıyla paylaşmayın.",
)
RESET = (
    "{shop} şifre sıfırlama kodunuz: {code}. Kodu kimseyle paylaşmayın.",
    "{shop} paneli için şifre sıfırlama kodunuz {code}. Bu kodu kimseyle paylaşmayın.",
    "{shop} panel şifrenizi sıfırlamak için kodunuz: {code}. Kodu başkasıyla paylaşmayın.",
)
CONFIRM = (
    "✅ Randevunuz onaylandı\n{shop}\n{day} {date}, {time} · {staff}\n{service}\n\nGörüşmek üzere!",
    "Randevunuz alındı ✅\n{service} · {staff}\n📅 {day} {date}, saat {time}\n{shop}",
    "Merhaba {first}, randevunuz hazır ✅\n{day} {date} · {time}\n{service} · {staff}\n{shop}",
    "{shop} randevunuz onaylandı ✅\n📅 {day} {date}, {time}\n✂️ {service} ({staff})\nSizi bekliyoruz!",
)
# Randevuyu işletme/personel panelden (telefonla, yüz yüze) oluşturduğunda: müşteri kendisi almadı, bu belli olmalı.
CONFIRM_MANUAL = (
    "{shop} sizin için randevu oluşturdu ✅\n📅 {day} {date}, {time}\n✂️ {service} ({staff})\nGörüşmek üzere!",
    "Merhaba {first}, {shop} randevunuzu oluşturdu ✅\n{day} {date} · {time}\n{service} · {staff}",
    "Randevunuz {shop} tarafından oluşturuldu ✅\n📅 {day} {date}, saat {time}\n{service} · {staff}\nSizi bekliyoruz!",
    "{shop} randevunuzu kaydetti ✅\n📅 {day} {date}, {time}\n{service} · {staff}",
)
CANCEL_CUSTOMER = (
    "Randevunuz iptal edildi.\n{day} {date} {time} · {service}\nYeniden randevu için: {link}",
    "İptal işleminiz tamam ✔️\n{day} {date}, {time} randevusu iptal edildi.\nYeni randevu: {link}",
    "{first}, {day} {date} {time} randevunuz iptal edildi. İsterseniz yeniden alabilirsiniz: {link}",
)
CANCEL_SHOP = (
    "{shop} randevunuzu iptal etmek zorunda kaldı 🙏\n{day} {date} {time} · {service}\nÖzür dileriz. Yeni randevu: {link}",
    "Üzgünüz, {day} {date} {time} randevunuz işletme tarafından iptal edildi 🙏\nYeni randevu için: {link}",
    "{first}, {shop} {day} {date} {time} randevunuzu iptal etti. Rahatsızlık için özür dileriz 🙏 Yeni randevu: {link}",
)
REMINDER = (
    "⏰ Hatırlatma\nBugün {time} · {service}\n{staff} · {shop}",
    "Randevunuza 1 saat kaldı ⏰\n{time} · {service} ({staff})\n{shop}",
    "{first}, bugün saat {time} randevunuz var ⏰\n{shop} · {staff}",
)
STAFF_NEW = (
    "🆕 Yeni randevu\n{day} {date}, {time}\n{customer} · {service}",
    "Yeni randevu geldi 📅\n{customer} · {service}\n{day} {date} saat {time}",
    "🆕 {day} {date} {time} · {customer}\n{service}",
)
STAFF_CANCEL = (
    "❌ Randevu iptal\n{day} {date}, {time}\n{customer} · {service}",
    "İptal edildi ❌ {customer}, {day} {date} {time} ({service})",
    "❌ {day} {date} {time} randevusu iptal: {customer} · {service}",
)
WELCOME = (
    "Merhaba, {shop} 👋 Randevu için: {link}\nSorularınız için yazabilirsiniz.",
    "{shop}'e hoş geldiniz! Online randevu almak için: {link}",
    "Selam 👋 {shop} randevu sayfası: {link}\nBaşka bir konuda yazabilirsiniz.",
    "Merhaba! {shop} olarak yardımcı olmaktan memnuniyet duyarız. Hızlıca randevu almak için: {link}",
)

_VARIANTS: dict[str, tuple[str, ...]] = {
    "otp": OTP, "password_reset": RESET, "confirm": CONFIRM, "confirm_manual": CONFIRM_MANUAL, "cancel_customer": CANCEL_CUSTOMER,
    "cancel_shop": CANCEL_SHOP, "reminder": REMINDER, "staff_new": STAFF_NEW, "staff_cancel": STAFF_CANCEL, "welcome": WELCOME,
}
_last: dict[tuple[int | None, str], int] = {}


def _pick(kind: str, tenant_id: int | None) -> str:
    variants = _VARIANTS[kind]
    last = _last.get((tenant_id, kind))
    choices = [i for i in range(len(variants)) if i != last] or list(range(len(variants)))
    i = random.choice(choices)
    _last[(tenant_id, kind)] = i
    return variants[i]


def render(kind: str, tenant_id: int | None = None, **values: str) -> str:
    return _pick(kind, tenant_id).format(**values)


def fmt_day(d: date) -> str:
    return DAYS[d.weekday()]


def fmt_date(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]}"


def fmt_time(t: time) -> str:
    return t.strftime("%H:%M")


def site_url(slug: str) -> str:
    """Müşterinin randevu alma sayfası."""
    if settings.environment == "development":
        return f"http://{slug}.localhost:5173/randevu"
    return f"https://{slug}.{settings.base_domain}/randevu"


# Geriye uyumluluk: OTP/şifre sıfırlama (otp_delivery ve api bunları kullanır)
def otp_text(shop: str, code: str, tenant_id: int | None = None) -> str:
    return render("otp", tenant_id, shop=shop, code=code)


def reset_text(shop: str, code: str, tenant_id: int | None = None) -> str:
    return render("password_reset", tenant_id, shop=shop, code=code)
