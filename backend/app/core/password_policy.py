from fastapi import HTTPException

COMMON = {"12345678", "123456789", "1234567890", "password", "11111111", "00000000", "qwerty123"}


def password_policy_error(password: str, phone: str | None = None) -> str | None:
    """Yeni belirlenen platform yöneticisi şifreleri için kurallar; sorun varsa Türkçe mesaj döner."""
    if len(password) < 8:
        return "Şifre en az 8 karakter olmalıdır"
    if len(password) > 128:
        return "Şifre en fazla 128 karakter olabilir"
    if phone and password == phone:
        return "Şifre telefon numaranızla aynı olamaz"
    if password.lower() in COMMON or len(set(password)) == 1:
        return "Bu şifre çok yaygın, daha güçlü bir şifre seçin"
    return None


def enforce_password_policy(password: str, phone: str | None = None) -> None:
    err = password_policy_error(password, phone)
    if err:
        raise HTTPException(status_code=422, detail=err)
