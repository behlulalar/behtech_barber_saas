from pydantic import BaseModel, ConfigDict, Field

from app.schemas.otp import Phone

class LoginRequest(BaseModel):

    phone: str
    password: str
    remember: bool = False

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


class ForgotReset(BaseModel):
    phone: Phone
    code: str = Field(min_length=1, max_length=10)
    new_password: str = Field(max_length=128)
