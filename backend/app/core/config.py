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
    model_config = SettingsConfigDict(env_file=".env")
    
settings = Settings()
