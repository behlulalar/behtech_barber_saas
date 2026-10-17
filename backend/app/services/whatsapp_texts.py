"""WhatsApp mesaj metinleri. Okunaklı (paragraflar boş satırla, bilgiler alt alta), resmi ve mesafeli ("Sayın …", siz dili). Emoji: yalnızca onay (✅), hatırlatma (⏰), berbere yeni randevu (📅), mesaj başına EN FAZLA BİR; OTP/şifre kodu, iptal ve karşılamada YOK. Her türde EN AZ 3 eşdeğer kalıp vardır; kalıplar dönüşümlü seçilir
(aynı dükkân + tür için art arda aynı kalıp seçilmez), böylece mesajlar birebir aynı görünmez (spam/ban riski azalır).
Bağlantı yalnızca gerektiğinde: karşılama ve iptal sonrası yeniden randevu. OTP, onay ve hatırlatmada link YOK."""
import random
from datetime import date, time

from app.core.config import settings

DAYS = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")
MONTHS = ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")

# Biçim: paragraflar BOŞ SATIRLA ayrılır (selamlama / ana bilgi / kapanış); randevu bilgileri {details} bloğunda
# (Tarih, Saat, Hizmet, Personel) ALT ALTA satırlar; bağlantı kendi satırında. Üslup: resmi, mesafeli, "siz" dili; emoji kuralı yukarıda.
OTP = (
    "Sayın müşterimiz,\n\n{shop} randevunuz için doğrulama kodunuz: {code}.\n\nLütfen kodu başkasıyla paylaşmayınız.",
    "{shop} için doğrulama kodunuz:\n\n{code}\n\nGüvenliğiniz için bu kodu kimseyle paylaşmayınız.",
    "Sayın müşterimiz,\n\n{shop} randevu doğrulama kodunuz: {code}.\n\nBu kodu kimseyle paylaşmayınız.",
)
RESET = (
    "Sayın kullanıcımız,\n\n{shop} şifre sıfırlama kodunuz: {code}.\n\nBu kodu kimseyle paylaşmayınız.",
    "{shop} paneli için şifre sıfırlama kodunuz:\n\n{code}\n\nGüvenliğiniz için bu kodu kimseyle paylaşmayınız.",
    "Sayın kullanıcımız,\n\n{shop} panel şifrenizi sıfırlamak için kodunuz: {code}.\n\nLütfen kodu başkasıyla paylaşmayınız.",
)
CONFIRM = (
    "Sayın {customer},\n\n✅ Randevunuz onaylanmıştır.\n\n{shop}\n\n{details}\n\nSizi bekliyoruz.\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
    "✅ {shop} randevunuz oluşturulmuştur.\n\n{details}\n\nİyi günler dileriz.\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
    "Sayın {customer},\n\n{shop} randevunuz onaylanmıştır. ✅\n\n{details}\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
    "✅ Randevunuz onaylanmıştır.\n\n{shop}\n\n{details}\n\nİyi günler dileriz.\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
)
# Randevuyu işletme/personel panelden (telefonla, yüz yüze) oluşturduğunda: müşteri kendisi almadı, bu belli olmalı.
CONFIRM_MANUAL = (
    "Sayın {customer},\n\n✅ {shop} tarafından adınıza randevu oluşturulmuştur.\n\n{details}\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
    "✅ {shop} sizin için randevu oluşturmuştur.\n\n{details}\n\nİyi günler dileriz.\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
    "Sayın {customer},\n\nRandevunuz {shop} tarafından kaydedilmiştir. ✅\n\n{details}\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
    "✅ {shop} tarafından adınıza randevu alınmıştır.\n\n{details}\n\nSizi bekliyoruz.\n\nİptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.",
)
CANCEL_CUSTOMER = (
    "Sayın {customer},\n\nAşağıdaki randevunuz iptal edilmiştir.\n\n{details}\n\nYeni randevu için:\n{link}",
    "Randevu iptaliniz gerçekleştirilmiştir.\n\nİptal edilen randevu:\n\n{details}\n\nYeni randevu için:\n{link}",
    "Sayın {customer},\n\nTalebiniz üzerine aşağıdaki randevunuz iptal edilmiştir.\n\n{details}\n\nYeni randevu için:\n{link}",
)
CANCEL_SHOP = (
    "Sayın {customer},\n\nAşağıdaki randevunuz {shop} tarafından iptal edilmiştir.\n\n{details}\n\nVerdiğimiz rahatsızlıktan dolayı özür dileriz.\n\nYeni randevu için:\n{link}",
    "{shop} olarak, aşağıdaki randevunuzu iptal etmek zorunda kaldığımızı bildiririz.\n\n{details}\n\nAnlayışınız için teşekkür ederiz.\n\nYeni randevu için:\n{link}",
    "Sayın {customer},\n\nİşletmemizden kaynaklanan bir nedenle aşağıdaki randevunuz iptal edilmiştir.\n\n{details}\n\nÖzür dileriz.\n\nYeni randevu için:\n{link}",
)
REMINDER = (
    "Sayın {customer},\n\n⏰ Bugün saat {time} randevunuz bulunmaktadır.\n\n{shop}\n\nHizmet: {service}\nPersonel: {staff}",
    "⏰ Hatırlatma: Randevunuza 1 saat kalmıştır.\n\n{shop}\n\nSaat: {time}\nHizmet: {service}\nPersonel: {staff}",
    "Sayın {customer},\n\n⏰ Randevunuza 1 saat kalmıştır.\n\nSaat: {time}\nHizmet: {service}\nPersonel: {staff}\n\n{shop}",
)
STAFF_NEW = (
    "📅 Yeni randevu\n\nTarih: {day} {date}\nSaat: {time}\nMüşteri: {customer}\nHizmet: {service}",
    "📅 Size yeni bir randevu atanmıştır.\n\nTarih: {day} {date}\nSaat: {time}\nMüşteri: {customer}\nHizmet: {service}",
    "📅 Yeni randevu bilgisi\n\nMüşteri: {customer}\nHizmet: {service}\nTarih: {day} {date}\nSaat: {time}",
)
STAFF_CANCEL = (
    "Randevu iptali\n\nTarih: {day} {date}\nSaat: {time}\nMüşteri: {customer}\nHizmet: {service}",
    "Aşağıdaki randevu iptal edilmiştir.\n\nTarih: {day} {date}\nSaat: {time}\nMüşteri: {customer}\nHizmet: {service}",
    "Randevu iptal bilgisi\n\nMüşteri: {customer}\nHizmet: {service}\nTarih: {day} {date}\nSaat: {time}",
)
CANCEL_NONE = (
    "Sayın müşterimiz,\n\nBu numaraya ait iptal edilebilecek bir randevu bulunamamıştır.\n\nYeni randevu için:\n{link}",
    "{shop} kayıtlarında bu numaraya ait yaklaşan bir randevu görünmemektedir.\n\nYeni randevu için:\n{link}",
    "Sayın müşterimiz,\n\nİptal edilecek aktif bir randevunuz bulunamamıştır.\n\nRandevu almak için:\n{link}",
)
CANCEL_LATE = (
    "Sayın müşterimiz,\n\nRandevunuza 2 saatten az kaldığı için iptal işlemi bu yolla yapılamamaktadır.\n\nLütfen işletmemizle doğrudan iletişime geçiniz.",
    "{shop} olarak, randevunuza 2 saatten az kaldığı için iptalinizi gerçekleştiremedik.\n\nLütfen işletmemizle doğrudan iletişime geçiniz.",
    "Sayın müşterimiz,\n\nRandevu saatine 2 saatten az kaldığından iptal talebiniz işleme alınamamıştır.\n\nLütfen işletmemizle doğrudan görüşünüz.",
)
CANCEL_LINK = (
    "Sayın müşterimiz,\n\nRandevunuzu iptal etmek için lütfen aşağıdaki adresten telefon numaranızla giriş yapınız.\n{link}",
    "{shop} randevu iptali için lütfen aşağıdaki adrese giriş yapınız.\n\n{link}\n\nGiriş telefon numaranızla yapılır.",
    "Sayın müşterimiz,\n\nİptal işlemi için aşağıdaki adresten telefon numaranızla giriş yapmanız gerekmektedir.\n{link}",
)
RESCHEDULE_CUSTOMER = (
    "Sayın {customer},\n\nRandevunuz güncellenmiştir.\n\n{shop}\n\nYeni randevu bilgileriniz:\n{details}\n\nÖnceki randevu: {old_day} {old_date}, {old_time}",
    "{shop} randevunuzun saati değiştirilmiştir.\n\nYeni randevu bilgileriniz:\n{details}\n\nİyi günler dileriz.",
    "Sayın {customer},\n\nTalebiniz üzerine randevunuz yeni tarihe alınmıştır.\n\n{shop}\n\n{details}\n\nÖnceki randevu: {old_day} {old_date}, {old_time}",
)
STAFF_RESCHEDULE = (
    "Randevu değişikliği\n\nMüşteri: {customer}\nHizmet: {service}\nYeni: {day} {date}, {time}\nÖnceki: {old_day} {old_date}, {old_time}",
    "Aşağıdaki randevunun saati değiştirilmiştir.\n\nMüşteri: {customer}\nHizmet: {service}\nYeni tarih: {day} {date}\nYeni saat: {time}",
    "Randevu güncellendi\n\nMüşteri: {customer}\nHizmet: {service}\nÖnceki: {old_day} {old_date}, {old_time}\nYeni: {day} {date}, {time}",
)
WELCOME = (
    "Sayın müşterimiz,\n\n{shop} işletmesine hoş geldiniz.\n\nRandevu almak için:\n{link}\n\nSorularınız için bu numaradan yazabilirsiniz.",
    "{shop} olarak sizi ağırlamaktan memnuniyet duyarız.\n\nOnline randevu için:\n{link}\n\nBaşka bir konuda yazabilirsiniz.",
    "Sayın müşterimiz,\n\n{shop} randevu sayfası:\n{link}\n\nSorularınız için bu numaradan bize ulaşabilirsiniz.",
    "{shop} ile ilgilendiğiniz için teşekkür ederiz.\n\nRandevu almak için:\n{link}\n\nBaşka bir konuda yardıma ihtiyaç duyarsanız yazabilirsiniz.",
)

_VARIANTS: dict[str, tuple[str, ...]] = {
    "otp": OTP, "password_reset": RESET, "confirm": CONFIRM, "confirm_manual": CONFIRM_MANUAL, "cancel_customer": CANCEL_CUSTOMER,
    "cancel_shop": CANCEL_SHOP, "reschedule_customer": RESCHEDULE_CUSTOMER, "cancel_none": CANCEL_NONE, "cancel_late": CANCEL_LATE, "cancel_link": CANCEL_LINK, "staff_reschedule": STAFF_RESCHEDULE, "reminder": REMINDER, "staff_new": STAFF_NEW, "staff_cancel": STAFF_CANCEL, "welcome": WELCOME,
}
_last: dict[tuple[int | None, str], int] = {}


def _pick(kind: str, tenant_id: int | None) -> str:
    variants = _VARIANTS[kind]
    last = _last.get((tenant_id, kind))
    choices = [i for i in range(len(variants)) if i != last] or list(range(len(variants)))
    i = random.choice(choices)
    _last[(tenant_id, kind)] = i
    return variants[i]


def _details(v: dict[str, str]) -> str:
    """Randevu bilgi bloğu: her bilgi ayrı satırda (okunabilirlik)."""
    lines = []
    if "day" in v and "date" in v:
        lines.append(f"Tarih: {v['day']} {v['date']}")
    if "time" in v:
        lines.append(f"Saat: {v['time']}")
    if "service" in v:
        lines.append(f"Hizmet: {v['service']}")
    if "staff" in v:
        lines.append(f"Personel: {v['staff']}")
    return "\n".join(lines)


def format_variant(template: str, values: dict[str, str]) -> str:
    v = dict(values)
    if "{details}" in template:
        v["details"] = _details(v)
    return template.format(**v)


def render(kind: str, tenant_id: int | None = None, **values: str) -> str:
    return format_variant(_pick(kind, tenant_id), values)


def fmt_day(d: date) -> str:
    return DAYS[d.weekday()]


def fmt_date(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]}"


def fmt_time(t: time) -> str:
    return t.strftime("%H:%M")


def my_appointments_url(slug: str) -> str:
    return site_url(slug).replace("/randevu", "/randevularim")


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
