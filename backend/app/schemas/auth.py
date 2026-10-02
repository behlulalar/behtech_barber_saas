from pydantic import BaseModel, ConfigDict

class LoginRequest(BaseModel):

    phone: str
    password: str
    tenant_slug: str

class TokenResponse(BaseModel):

    access_token: str
    token_type: str

    