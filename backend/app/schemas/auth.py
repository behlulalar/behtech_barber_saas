from pydantic import BaseModel, ConfigDict

class LoginRequest(BaseModel):

    phone: str
    password: str

class TokenResponse(BaseModel):

    access_token: str
    token_type: str

    