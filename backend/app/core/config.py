from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    remember_token_expire_minutes: int = 60 * 24 * 30
    base_domain: str
    environment: str
    daily_appointment_limit: int
    otp_expiration_seconds: int
    backup_retention_days: int
    evolution_api_base_url: str
    evolution_api_key: str
    # ESKİ (tek platform hattı) — artık kullanılmıyor; her dükkânın kendi instance'ı var (whatsapp_connections).
    evolution_instance_name: str | None = None
    # Evolution'ın olayları (bağlantı durumu) göndereceği adres: backend'in /api/webhooks/evolution'ı.
    # Yerelde Docker'dan host'a: http://host.docker.internal:8001/api/webhooks/evolution
    evolution_webhook_url: str | None = None
    # Webhook'u doğrulamak için gizli anahtar (URL'ye ?token= olarak eklenir). Boşsa webhook reddedilir.
    evolution_webhook_secret: str | None = None
    # Sadece geliştirmede: WhatsApp bağlanana kadar her OTP bu kod olur. environment
    # "development" değilse yok sayılır. WhatsApp testine geçince .env'den silin.
    otp_fixed_code: str | None = None
    # Billing bildirimleri (hepsi opsiyonel; yoksa ilgili kanal kapalı)
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True
    # Giriş denemesi sınırı: aynı hesap için LOGIN_LOCK_MINUTES içinde LOGIN_MAX_FAILURES hatalı deneme kilitler.
    # İşletme başına saatlik WhatsApp (OTP) mesaj üst sınırı: bir işletme spam yaparsa ortak hat yanmasın.
    whatsapp_tenant_hourly_limit: int = 60
    login_max_failures: int = 5
    login_lock_minutes: int = 15
    # Reverse proxy (nginx) arkasında True yapın: IP, X-Forwarded-For'un ilk değerinden alınır.
    # Proxy yoksa True yapmayın; istemci başlığı sahte yazabilir.
    trust_proxy_headers: bool = False
    model_config = SettingsConfigDict(env_file=".env")
    
settings = Settings()
