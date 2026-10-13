from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    base_domain: str
    environment: str
    daily_appointment_limit: int
    model_config = SettingsConfigDict(env_file=".env")
    
settings = Settings()
