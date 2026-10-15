from pydantic import BaseModel, ConfigDict, Field

class LoginRequest(BaseModel):

    phone: str
    password: str

class TokenResponse(BaseModel):

    access_token: str
    token_type: str

    

class ImpersonateExchange(BaseModel):
    code: str = Field(min_length=10, max_length=200)
