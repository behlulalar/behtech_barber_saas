# BehTech Randevu backend (FastAPI). Üretim imajı: sabitlenmiş bağımlılıklar, root olmayan kullanıcı.
FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 TZ=Europe/Istanbul PYTHONPATH=/app

# psycopg2-binary / bcrypt hazır tekerlekle gelir; yalnızca saat dilimi verisi ve sağlık kontrolü için curl
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.lock ./
RUN pip install -r requirements.lock

COPY . .
RUN useradd --system --uid 10001 --home /app app && mkdir -p /app/backups && chown -R app /app
USER app

EXPOSE 8001
# --reload YOK. Worker sayısı compose'ta ayarlanır.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
