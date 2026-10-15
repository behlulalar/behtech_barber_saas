from pydantic import BaseModel, ConfigDict


class TenantPublicOut(BaseModel):
    name: str
    slug: str
    business_name: str
    business_address: str | None = None
    logo_image: str | None = None
    banner_image: str | None = None
    contact_phone: str | None = None
    whatsapp_phone: str | None = None
    instagram: str | None = None


class StaffPublicOut(BaseModel):
    """Herkese açık berber listesi: telefon / tenant_id YOK."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    surname: str
    photo_image: str | None = None
    service_ids: list[int] = []


class SendCodeResponse(BaseModel):
    message: str
    dev_code: str | None = None


class CustomerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    surname: str


class VerifyCodeResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    customer: CustomerBrief | None = None
