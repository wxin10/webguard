from urllib.parse import urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings for local development."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

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
    ENABLE_RUNTIME_SCHEMA_GUARD: bool | None = None
    JWT_SECRET: str = "webguard-dev-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRES_DAYS: int = 14
    REFRESH_TOKEN_COOKIE_NAME: str = "webguard_refresh_token"
    REFRESH_TOKEN_COOKIE_SECURE: bool = False
    PLUGIN_BINDING_CHALLENGE_EXPIRES_MINUTES: int = 5
    PLUGIN_REFRESH_TOKEN_EXPIRES_DAYS: int = 30
    DEFAULT_ADMIN_PASSWORD: str = "admin"
    DEFAULT_GUEST_PASSWORD: str = "guest"
    SECRET_ENCRYPTION_KEY: str | None = None

    DEEPSEEK_API_KEY: str | None = None
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_ENABLED: str = "auto"
    DEEPSEEK_TIMEOUT_SECONDS: int = 20

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
    def runtime_schema_guard_enabled(self) -> bool:
        if self.ENABLE_RUNTIME_SCHEMA_GUARD is None:
            return bool(self.DEBUG)
        return bool(self.ENABLE_RUNTIME_SCHEMA_GUARD)

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

    @property
    def deepseek_configured(self) -> bool:
        return bool((self.DEEPSEEK_API_KEY or "").strip())

    @property
    def deepseek_enabled(self) -> bool:
        mode = str(self.DEEPSEEK_ENABLED or "auto").strip().lower()
        if mode in {"false", "0", "off", "disabled", "no"}:
            return False
        if mode in {"true", "1", "on", "enabled", "yes"}:
            return True
        return self.deepseek_configured

    @property
    def deepseek_api_key_masked(self) -> str | None:
        api_key = (self.DEEPSEEK_API_KEY or "").strip()
        if not api_key:
            return None
        if len(api_key) <= 8:
            return api_key[:2] + "****"
        return api_key[:3] + "****" + api_key[-4:]

    def _normalize_database_url(self, database_url: str) -> str:
        if database_url.startswith("postgres://"):
            database_url = "postgresql://" + database_url[len("postgres://"):]
        if database_url.startswith("postgresql://"):
            parsed = urlsplit(database_url)
            return urlunsplit(("postgresql+psycopg", parsed.netloc, parsed.path, parsed.query, parsed.fragment))
        return database_url

    def validate_production_safety(self) -> None:
        """Fail fast when production mode is paired with local-only settings."""
        if self.DEBUG:
            return

        errors: list[str] = []
        if self.ENABLE_DEV_AUTH:
            errors.append("ENABLE_DEV_AUTH must be false when DEBUG=false")
        if self.JWT_SECRET in {"webguard-dev-secret", "replace_me_in_local_env"} or len(self.JWT_SECRET) < 32:
            errors.append("JWT_SECRET must be replaced with a strong secret")
        if not self.REFRESH_TOKEN_COOKIE_SECURE:
            errors.append("REFRESH_TOKEN_COOKIE_SECURE must be true when DEBUG=false")
        if "*" in self.cors_origins_list:
            errors.append("CORS_ORIGINS must not contain wildcard origins when DEBUG=false")
        if self.runtime_schema_guard_enabled:
            errors.append("ENABLE_RUNTIME_SCHEMA_GUARD must be false when DEBUG=false")
        if self.DEFAULT_ADMIN_PASSWORD == "admin" or self.DEFAULT_GUEST_PASSWORD == "guest":
            errors.append("default account passwords must be changed when DEBUG=false")
        if not (self.SECRET_ENCRYPTION_KEY or "").strip():
            errors.append("production must configure SECRET_ENCRYPTION_KEY")

        if errors:
            raise RuntimeError("Unsafe production settings: " + "; ".join(errors))

settings = Settings()
settings.validate_production_safety()
