from pydantic import BaseModel, Field

from app.schemas.otp import Phone
from app.schemas.platform import PersonName


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(max_length=255)  # biçim/rezerve kontrolü serviste
    owner_name: PersonName
    owner_surname: PersonName
    owner_phone: Phone
    password: str = Field(min_length=8, max_length=128)
    email: str | None = Field(default=None, max_length=255)
    accept_terms: bool = False


class SignupResponse(BaseModel):
    message: str
    slug: str
