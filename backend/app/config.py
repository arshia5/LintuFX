from functools import lru_cache
import re

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    database_url: str | None = Field(default=None)
    db_host: str | None = Field(default="localhost")
    db_name: str | None = Field(default="fx_ledger")
    db_port: int | None = Field(default=5432)
    db_username: str | None = Field(default="postgres")
    db_password: str | None = Field(default=None)
    allowed_ips: str | None = Field(default=None)
    cors_allowed_origins: str | None = Field(default=None)
    cors_allowed_origin_regex: str | None = Field(default=None)
    jwt_secret_key: str = Field(default="change-this-secret-before-production")
    jwt_access_token_expire_minutes: int = Field(default=60)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator(
        "database_url",
        "db_host",
        "db_name",
        "db_port",
        "db_username",
        "db_password",
        "allowed_ips",
        "cors_allowed_origins",
        "cors_allowed_origin_regex",
        "jwt_secret_key",
        "jwt_access_token_expire_minutes",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            if self.database_url.startswith("postgres://"):
                return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
            if self.database_url.startswith("postgresql://"):
                return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
            return self.database_url

        required_values = {
            "DB_HOST": self.db_host,
            "DB_NAME": self.db_name,
            "DB_PORT": self.db_port,
            "DB_USERNAME": self.db_username,
        }
        missing = [name for name, value in required_values.items() if value in (None, "")]
        if missing:
            raise RuntimeError(
                "Database configuration is missing. Set DATABASE_URL or these variables: "
                + ", ".join(missing)
            )

        url = URL.create(
            "postgresql+psycopg",
            username=self.db_username,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )
        return url.render_as_string(hide_password=False)

    @property
    def allowed_ip_set(self) -> set[str]:
        if not self.allowed_ips:
            return set()
        return {
            item.strip()
            for item in self.allowed_ips.replace(";", ",").split(",")
            if item.strip()
        }

    @property
    def cors_allowed_origin_list(self) -> list[str]:
        if not self.cors_allowed_origins:
            return []
        return [
            item.strip().rstrip("/")
            for item in self.cors_allowed_origins.replace(";", ",").split(",")
            if item.strip()
        ]

    @property
    def resolved_cors_allowed_origin_regex(self) -> str | None:
        if self.cors_allowed_origin_regex:
            return self.cors_allowed_origin_regex

        if self.cors_allowed_origins or not self.allowed_ip_set:
            return None

        hosts = [
            re.escape(item)
            for item in sorted(self.allowed_ip_set)
            if "://" not in item and "/" not in item
        ]
        if not hosts:
            return None

        return rf"^https?://({'|'.join(hosts)})(:\d+)?$"


@lru_cache
def get_settings() -> Settings:
    return Settings()
