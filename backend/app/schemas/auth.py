from pydantic import BaseModel, ConfigDict, Field

from app.schemas.otp import Phone

class LoginRequest(BaseModel):

    phone: str
    password: str
    remember: bool = False
    # Giriş adresindeki gizli parça (/panel/g/<panel_key>). Yoksa/yanlışsa 404: giriş yalnızca bu adresten yapılabilir.
    panel_key: str | None = Field(default=None, max_length=64)

class TokenResponse(BaseModel):

    access_token: str
    token_type: str

    

class ImpersonateExchange(BaseModel):
    code: str = Field(min_length=10, max_length=200)


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


class ForgotSendCode(BaseModel):
    phone: Phone
    panel_key: str | None = Field(default=None, max_length=64)


class ForgotReset(BaseModel):
    phone: Phone
    code: str = Field(min_length=1, max_length=10)
    new_password: str = Field(max_length=128)
    panel_key: str | None = Field(default=None, max_length=64)


class PanelKeyVerify(BaseModel):
    panel_key: str = Field(max_length=64)


class PanelLoginUrlOut(BaseModel):
    path: str  # "/panel/g/<gizli parça>" — alan adı arayüzde eklenir
