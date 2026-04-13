from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings for local development."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "WebGuard"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 3306
    DB_NAME: str = "webguard"
    DB_USER: str = "admin"
    DB_PASSWORD: str = "adminadmin"
    DB_CHARSET: str = "utf8mb4"
    DATABASE_URL: str | None = None

    MODEL_DIR: str = "./models"
    MODEL_NAME: str = "text_classifier"

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset={self.DB_CHARSET}"
        )

settings = Settings()
