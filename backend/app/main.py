import logging

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import admin, billing, platform, public

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BehTech Berber SaaS API")

# Tüm API /api altında: frontend route'ları (/, /randevu, /panel, /platform...) ile
# backend path'leri hiç çakışmasın, proxy/nginx tek bir önekle yönlendirsin.
app.include_router(public.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(platform.router, prefix="/api")
app.include_router(billing.router, prefix="/api")


# Framework'ün ürettiği İngilizce hata mesajlarını kullanıcıya Türkçe göster.
_TR_DETAILS = {
    "Not authenticated": "Oturum geçersiz, lütfen tekrar giriş yapın",
    "Not Found": "Kaynak bulunamadı",
    "Method Not Allowed": "Bu işlem desteklenmiyor",
}


@app.exception_handler(StarletteHTTPException)
async def tr_http_exception_handler(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, str) and exc.detail in _TR_DETAILS:
        exc.detail = _TR_DETAILS[exc.detail]
    return await http_exception_handler(request, exc)
