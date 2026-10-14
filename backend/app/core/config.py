from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    base_domain: str
    environment: str
    daily_appointment_limit: int
    otp_expiration_seconds: int
    backup_retention_days: int
    evolution_api_base_url: str
    evolution_api_key: str
    evolution_instance_name: str
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
    model_config = SettingsConfigDict(env_file=".env")
    
settings = Settings()
