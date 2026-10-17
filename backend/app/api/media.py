from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core import media

router = APIRouter()


@router.get("/media/{name}", include_in_schema=False)
async def get_media(name: str):
    """Yüklenen görsel. Adres içerik özetidir: içerik değişirse adres değişir, bu yüzden sonsuza dek önbelleğe alınabilir."""
    path = media.file_for(name)
    if path is None:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    return FileResponse(
        path, media_type=media.MIME[name.rsplit(".", 1)[1]],
        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )
