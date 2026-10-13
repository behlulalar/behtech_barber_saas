from sqlalchemy.orm import declarative_base
from app.core.config import settings
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    session = SessionFactory()
    try:
        yield session
    finally:
        # finally olmadan, endpoint ya da bir dependency HTTPException fırlattığında
        # close() hiç çalışmıyor ve bağlantı havuza dönmüyordu; ~15 hata yanıtından
        # sonra havuz tükenip tüm istekler asılı kalıyordu.
        await session.close()
