from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.tenant import Tenant
from sqlalchemy import select
from app.schemas.tenant import TenantOut


app = FastAPI()

@app.get("/health")
async def health_check():
    return {"status": "healthy 200 OK"}

@app.get("/tenants", response_model=list[TenantOut])
async def tenants_route(db: Session = Depends(get_db)):
    tenants = select(Tenant) 
    result = await db.execute(tenants) 
    all_tenants = result.scalars().all()
    return all_tenants






