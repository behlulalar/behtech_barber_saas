from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.staff import Staff
from app.models.tenant import Tenant
from app.core.config import settings
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


async def get_current_tenant(request: Request, db: Session = Depends(get_db)) -> Tenant:
    host = request.headers.get("host", "")
    host = host.split(":")[0]

    suffix = f".{settings.base_domain}"
    if not host.endswith(suffix):
        raise HTTPException(status_code=400, detail="Could not resolve tenant from host")

    slug = host[: -len(suffix)]

    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()

    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return tenant
