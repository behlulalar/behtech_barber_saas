import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel

PHONE_RE = re.compile(r"^5\d{9}$")


def _validate_phone(value: str) -> str:
    value = value.strip()
    if not PHONE_RE.match(value):
        raise ValueError("Telefon numarası 5 ile başlayan 10 haneli olmalıdır (örn. 5551234567)")
    return value


# Her telefon girdisinde kullanılan ortak tip: ^5\d{9}$
Phone = Annotated[str, AfterValidator(_validate_phone)]


class SendCodeRequest(BaseModel):
    phone: Phone


class VerifyCodeRequest(BaseModel):
    phone: Phone
    code: str
