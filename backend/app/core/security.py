from passlib.context import CryptContext
from datetime import datetime, timedelta
import jwt
from app.core.config import settings

context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])

