from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.staff import Staff 
import jwt

oauth2_scheme  = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_staff(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Staff:
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    staff_id = int(payload["sub"])

    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()

    if staff is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")



    return staff
