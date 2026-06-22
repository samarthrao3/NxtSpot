from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str
    supabase_url: str
    supabase_service_key: str
    jwt_secret: str

    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
