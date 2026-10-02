from sqlalchemy.orm import declarative_base
from app.core.config import settings 
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(settings.database_url)
SessionFactory = async_sessionmaker(engine)

Base = declarative_base()

async def get_db():
    kaynak = SessionFactory()
    yield kaynak 
    await kaynak.close()
