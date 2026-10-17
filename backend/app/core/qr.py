import base64
import io

import segno


def svg_data_uri(text: str, error: str = "q", scale: int = 10, border: int = 4) -> str:
    """Baskıya uygun QR (siyah-beyaz, sessiz bölge 4 modül, yüksek hata düzeltme). <img src> için bağımsız SVG data URI."""
    buf = io.BytesIO()
    segno.make(text, error=error).save(buf, kind="svg", scale=scale, border=border, dark="#000000", light="#ffffff", xmldecl=False, svgns=True)
    return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()
