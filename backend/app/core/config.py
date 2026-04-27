from urllib.parse import urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings for local development."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "WebGuard"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 5432
    DB_NAME: str = "webguard"
    DB_USER: str = "webguard"
    DB_PASSWORD: str = "webguard"
    DB_CHARSET: str = "utf8mb4"
    DATABASE_URL: str | None = None
    CORS_ORIGINS: str = "http://127.0.0.1:5173,http://localhost:5173,chrome-extension://__EXTENSION_ID__"
    ENABLE_DEV_AUTH: bool = True
    JWT_SECRET: str = "webguard-dev-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRES_DAYS: int = 14
    REFRESH_TOKEN_COOKIE_NAME: str = "webguard_refresh_token"
    REFRESH_TOKEN_COOKIE_SECURE: bool = False
    PLUGIN_BINDING_CHALLENGE_EXPIRES_MINUTES: int = 5
    PLUGIN_REFRESH_TOKEN_EXPIRES_DAYS: int = 30

    MODEL_DIR: str = "./models"
    MODEL_NAME: str = "text_classifier"

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.DATABASE_URL:
            return self._normalize_database_url(self.DATABASE_URL)
        return self._normalize_database_url(
            f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip()]

    @property
    def dev_auth_enabled(self) -> bool:
        return bool(self.DEBUG and self.ENABLE_DEV_AUTH)

    @property
    def mock_login_enabled(self) -> bool:
        return self.dev_auth_enabled

    @property
    def access_token_expires_seconds(self) -> int:
        return max(self.JWT_ACCESS_TOKEN_EXPIRES_MINUTES, 1) * 60

    @property
    def refresh_token_expires_seconds(self) -> int:
        return max(self.JWT_REFRESH_TOKEN_EXPIRES_DAYS, 1) * 24 * 60 * 60

    @property
    def plugin_binding_challenge_expires_seconds(self) -> int:
        return max(self.PLUGIN_BINDING_CHALLENGE_EXPIRES_MINUTES, 1) * 60

    @property
    def plugin_refresh_token_expires_seconds(self) -> int:
        return max(self.PLUGIN_REFRESH_TOKEN_EXPIRES_DAYS, 1) * 24 * 60 * 60

    def _normalize_database_url(self, database_url: str) -> str:
        if database_url.startswith("postgres://"):
            database_url = "postgresql://" + database_url[len("postgres://"):]
        if database_url.startswith("postgresql://"):
            parsed = urlsplit(database_url)
            return urlunsplit(("postgresql+psycopg", parsed.netloc, parsed.path, parsed.query, parsed.fragment))
        return database_url

settings = Settings()
