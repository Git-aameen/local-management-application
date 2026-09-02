from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    # RS256 JWT verification only needs the domain (for the issuer/JWKS URL) and audience —
    # no client secret. The backend never performs the OAuth flow itself (see CLAUDE.md).
    auth0_domain: str
    auth0_audience: str

    @property
    def async_database_url(self) -> str:
        """DATABASE_URL as configured is a sync DSN; SQLAlchemy's async engine needs the asyncpg driver."""
        if self.database_url.startswith("postgresql+asyncpg://"):
            return self.database_url
        return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
