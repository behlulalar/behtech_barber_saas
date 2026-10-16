"""Mesaj metinleri. Her seferinde birebir aynı metin bot görüntüsü verir; birkaç eşdeğer kalıp dönüşümlü kullanılır.
Bağlantı (link) YOK: linkli mesajlar spam filtresine daha çok takılır."""
import random

_OTP = (
    "{shop} randevu doğrulama kodunuz: {code}. Kodu kimseyle paylaşmayın.",
    "{shop} için doğrulama kodunuz {code}. Bu kodu kimseyle paylaşmayın.",
    "Merhaba, {shop} randevunuz için kodunuz: {code}. Kodu başkasıyla paylaşmayın.",
)
_RESET = (
    "{shop} şifre sıfırlama kodunuz: {code}. Kodu kimseyle paylaşmayın.",
    "{shop} paneli için şifre sıfırlama kodunuz {code}. Bu kodu kimseyle paylaşmayın.",
)


def otp_text(shop: str, code: str) -> str:
    return random.choice(_OTP).format(shop=shop, code=code)


def reset_text(shop: str, code: str) -> str:
    return random.choice(_RESET).format(shop=shop, code=code)
