from app.models.customer import Customers
from sqlalchemy import select 
from sqlalchemy.orm import Session

async def get_or_create_customer(db: Session, tenant_id: int, phone: str, name: str, surname: str) -> Customers:
    query = select(Customers).where(Customers.phone == phone, Customers.tenant_id == tenant_id)
    result = await db.execute(query)
    customer = result.scalar_one_or_none()

    if customer: 
        return customer
    
    new_customer = Customers(tenant_id=tenant_id, phone=phone, name=name, surname=surname)
    db.add(new_customer)
    await db.commit()
    await db.refresh(new_customer)
    return new_customer