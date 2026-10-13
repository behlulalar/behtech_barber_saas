import logging

from fastapi import FastAPI

from app.api import admin, platform, public

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BehTech Berber SaaS API")

# Tüm API /api altında: frontend route'ları (/, /randevu, /panel, /platform...) ile
# backend path'leri hiç çakışmasın, proxy/nginx tek bir önekle yönlendirsin.
app.include_router(public.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(platform.router, prefix="/api")
