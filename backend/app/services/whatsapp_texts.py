"""WhatsApp mesaj metinleri. KISA, resmi ve mesafeli ("Sayın …", siz dili, emojisiz). Her türde EN AZ 3 eşdeğer kalıp vardır; kalıplar dönüşümlü seçilir
(aynı dükkân + tür için art arda aynı kalıp seçilmez), böylece mesajlar birebir aynı görünmez (spam/ban riski azalır).
Bağlantı yalnızca gerektiğinde: karşılama ve iptal sonrası yeniden randevu. OTP, onay ve hatırlatmada link YOK."""
import random
from datetime import date, time

from app.core.config import settings

DAYS = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")
MONTHS = ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")

OTP = (
    "{shop} randevu doğrulama kodunuz: {code}. Bu kodu kimseyle paylaşmayınız.",
    "{shop} için doğrulama kodunuz: {code}. Güvenliğiniz için kodu kimseyle paylaşmayınız.",
    "Sayın müşterimiz, {shop} randevunuz için doğrulama kodunuz: {code}. Lütfen kodu başkasıyla paylaşmayınız.",
)
RESET = (
    "{shop} şifre sıfırlama kodunuz: {code}. Bu kodu kimseyle paylaşmayınız.",
    "{shop} paneli için şifre sıfırlama kodunuz: {code}. Güvenliğiniz için kodu kimseyle paylaşmayınız.",
    "Sayın kullanıcımız, {shop} panel şifrenizi sıfırlamak için kodunuz: {code}. Lütfen kodu başkasıyla paylaşmayınız.",
)
# Üslup: resmi, mesafeli, "siz" dili; emoji ve samimi kalıp YOK ("isterseniz", "görüşmek üzere" gibi).
CONFIRM = (
    "Sayın {customer}, randevunuz onaylanmıştır.\n{shop}\nTarih: {day} {date}, saat {time}\nHizmet: {service} ({staff})\nSizi bekliyoruz.",
    "{shop} randevunuz oluşturulmuştur.\nTarih: {day} {date}, saat {time}\nHizmet: {service}\nPersonel: {staff}\nİyi günler dileriz.",
    "Sayın {customer}, {day} {date} saat {time} için {shop} randevunuz onaylanmıştır.\nHizmet: {service} ({staff})",
    "Randevunuz onaylanmıştır.\n{shop}\n{day} {date}, saat {time}\n{service} · {staff}\nİyi günler dileriz.",
)
# Randevuyu işletme/personel panelden (telefonla, yüz yüze) oluşturduğunda: müşteri kendisi almadı, bu belli olmalı.
CONFIRM_MANUAL = (
    "Sayın {customer}, {shop} tarafından adınıza randevu oluşturulmuştur.\nTarih: {day} {date}, saat {time}\nHizmet: {service} ({staff})",
    "{shop} sizin için randevu oluşturmuştur.\nTarih: {day} {date}, saat {time}\nHizmet: {service}\nPersonel: {staff}\nİyi günler dileriz.",
    "Sayın {customer}, randevunuz {shop} tarafından kaydedilmiştir.\n{day} {date}, saat {time}\n{service} · {staff}",
    "{shop} tarafından adınıza randevu alınmıştır.\nTarih: {day} {date}, saat {time}\nHizmet: {service} ({staff})\nSizi bekliyoruz.",
)
CANCEL_CUSTOMER = (
    "Sayın {customer}, {day} {date} saat {time} tarihli randevunuz iptal edilmiştir.\nYeni randevu için: {link}",
    "Randevu iptaliniz gerçekleştirilmiştir.\nİptal edilen randevu: {day} {date}, saat {time} · {service}\nYeni randevu için: {link}",
    "Sayın {customer}, talebiniz üzerine {day} {date} saat {time} randevunuz iptal edilmiştir.\nYeni randevu için: {link}",
)
CANCEL_SHOP = (
    "Sayın {customer}, {day} {date} saat {time} tarihli randevunuz {shop} tarafından iptal edilmiştir. Verdiğimiz rahatsızlıktan dolayı özür dileriz.\nYeni randevu için: {link}",
    "{shop} olarak, {day} {date} saat {time} randevunuzu iptal etmek zorunda kaldığımızı bildiririz. Anlayışınız için teşekkür ederiz.\nYeni randevu için: {link}",
    "Sayın {customer}, işletmemizden kaynaklanan bir nedenle {day} {date} saat {time} randevunuz iptal edilmiştir. Özür dileriz.\nYeni randevu için: {link}",
)
REMINDER = (
    "Sayın {customer}, bugün saat {time} randevunuz bulunmaktadır.\n{shop} · {service} ({staff})",
    "Hatırlatma: bugün saat {time} randevunuz vardır.\n{shop}\nHizmet: {service} ({staff})",
    "Sayın {customer}, randevunuza 1 saat kalmıştır.\nSaat: {time}\n{shop} · {service} ({staff})",
)
STAFF_NEW = (
    "Yeni randevu\nTarih: {day} {date}, saat {time}\nMüşteri: {customer}\nHizmet: {service}",
    "Size yeni bir randevu atanmıştır.\n{day} {date}, saat {time}\n{customer} · {service}",
    "Yeni randevu bilgisi\n{customer} · {service}\n{day} {date}, saat {time}",
)
STAFF_CANCEL = (
    "Randevu iptali\nTarih: {day} {date}, saat {time}\nMüşteri: {customer}\nHizmet: {service}",
    "Aşağıdaki randevu iptal edilmiştir.\n{day} {date}, saat {time}\n{customer} · {service}",
    "Randevu iptal bilgisi\n{customer} · {service}\n{day} {date}, saat {time}",
)
WELCOME = (
    "Sayın müşterimiz, {shop} işletmesine hoş geldiniz. Randevu almak için: {link}\nSorularınız için bu numaradan yazabilirsiniz.",
    "{shop} olarak sizi ağırlamaktan memnuniyet duyarız. Online randevu için: {link}\nBaşka bir konuda yazabilirsiniz.",
    "Sayın müşterimiz, {shop} randevu sayfası: {link}\nSorularınız için bu numaradan bize ulaşabilirsiniz.",
    "{shop} ile ilgilendiğiniz için teşekkür ederiz. Randevu almak için: {link}\nBaşka bir konuda yardıma ihtiyaç duyarsanız yazabilirsiniz.",
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
