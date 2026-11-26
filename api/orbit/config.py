from __future__ import annotations

from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
MIN_SECRET_LENGTH = 32
AI_PROVIDERS = ("anthropic", "gemini", "openai")
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"


class SettingsError(ValueError):
    pass


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
        env_ignore_empty=True,
    )

    base_url: str = Field(default="http://localhost:3000", validation_alias="ORBIT_BASE_URL")
    secret_key: str = Field(default="", validation_alias="ORBIT_SECRET_KEY")
    database_url: str = Field(default="sqlite:///./data/orbit.db", validation_alias="DATABASE_URL")
    smtp_host: str = Field(default="", validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str = Field(default="", validation_alias="SMTP_USER")
    smtp_password: str = Field(default="", validation_alias="SMTP_PASSWORD")
    email_from: str = Field(default="Orbit <orbit@localhost>", validation_alias="EMAIL_FROM")
    resend_api_key: str = Field(default="", validation_alias="RESEND_API_KEY")
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    combine_model: str = Field(default="claude-opus-5-5", validation_alias="COMBINE_MODEL")
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-4-hydrogen", validation_alias="GEMINI_MODEL")
    gemini_use_vertex: bool = Field(default=False, validation_alias="GEMINI_USE_VERTEX")
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    openai_base_url: str = Field(default="", validation_alias="OPENAI_BASE_URL")
    openai_model: str = Field(default="", validation_alias="OPENAI_MODEL")
    ai_provider: str = Field(default="", validation_alias="ORBIT_AI_PROVIDER")
    allowed_emails_raw: str = Field(default="", validation_alias="ORBIT_ALLOWED_EMAILS")
    sentry_dsn: str = Field(default="", validation_alias="SENTRY_DSN")
    backup_s3_bucket: str = Field(default="", validation_alias="BACKUP_S3_BUCKET")
    backup_s3_endpoint_url: str = Field(default="", validation_alias="BACKUP_S3_ENDPOINT_URL")
    backup_s3_region: str = Field(default="", validation_alias="BACKUP_S3_REGION")
    backup_s3_prefix: str = Field(default="orbit/", validation_alias="BACKUP_S3_PREFIX")
    backup_keep_days: int = Field(default=14, ge=1, validation_alias="BACKUP_KEEP_DAYS")
    backup_hour_utc: int = Field(default=3, ge=0, le=23, validation_alias="BACKUP_HOUR_UTC")
    free_ai_uses: int = Field(default=20, ge=0, validation_alias="ORBIT_FREE_AI_USES")
    demo_mode: bool = Field(default=False, validation_alias="ORBIT_DEMO_MODE")
    max_created_spaces: int = Field(default=0, ge=0, validation_alias="ORBIT_MAX_CREATED_SPACES")
    max_update_emails_per_day: int = Field(
        default=0, ge=0, validation_alias="ORBIT_MAX_UPDATE_EMAILS_PER_DAY"
    )
    stripe_secret_key: str = Field(default="", validation_alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="", validation_alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_plus_monthly: str = Field(default="", validation_alias="STRIPE_PRICE_PLUS_MONTHLY")
    stripe_price_plus_yearly: str = Field(default="", validation_alias="STRIPE_PRICE_PLUS_YEARLY")
    stripe_price_ai_pack: str = Field(default="", validation_alias="STRIPE_PRICE_AI_PACK")
    stripe_price_email_pack: str = Field(default="", validation_alias="STRIPE_PRICE_EMAIL_PACK")

    @model_validator(mode="after")
    def _demo_mode_stays_on_localhost(self) -> Settings:
        if self.demo_mode and self.base_hostname not in LOCAL_HOSTS:
            raise SettingsError(
                "ORBIT_DEMO_MODE skips sign-in, so it only works when ORBIT_BASE_URL points "
                "at localhost"
            )
        return self

    @field_validator("ai_provider")
    @classmethod
    def _validate_ai_provider(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned and cleaned not in AI_PROVIDERS:
            raise SettingsError(
                "ORBIT_AI_PROVIDER must be anthropic, gemini or openai, or left empty"
            )
        return cleaned

    @field_validator("openai_base_url")
    @classmethod
    def _validate_openai_base_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned:
            return ""
        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise SettingsError(
                "OPENAI_BASE_URL must look like https://api.openai.com/v1 or http://localhost:11434/v1"
            )
        if parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise SettingsError(
                "OPENAI_BASE_URL must not contain a query, a fragment or credentials"
            )
        return cleaned

    @model_validator(mode="after")
    def _chosen_provider_has_a_key(self) -> Settings:
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            raise SettingsError("ORBIT_AI_PROVIDER is anthropic, so ANTHROPIC_API_KEY must be set")
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            raise SettingsError("ORBIT_AI_PROVIDER is gemini, so GEMINI_API_KEY must be set")
        if self.ai_provider == "openai" and not self.openai_ready:
            raise SettingsError(
                "ORBIT_AI_PROVIDER is openai, so OPENAI_MODEL must be set, together with "
                "OPENAI_API_KEY or OPENAI_BASE_URL"
            )
        return self

    @field_validator("base_url")
    @classmethod
    def _validate_base_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise SettingsError("ORBIT_BASE_URL must look like https://orbit.example.com")
        if parsed.path or parsed.query or parsed.fragment:
            raise SettingsError("ORBIT_BASE_URL must not contain a path, query or fragment")
        if parsed.scheme == "http" and parsed.hostname not in LOCAL_HOSTS:
            raise SettingsError("ORBIT_BASE_URL must use https unless it points at localhost")
        return cleaned

    @property
    def base_host(self) -> str:
        return urlparse(self.base_url).netloc

    @property
    def base_hostname(self) -> str:
        return urlparse(self.base_url).hostname or ""

    @property
    def mcp_url(self) -> str:
        return f"{self.base_url}/mcp"

    @property
    def secure_cookies(self) -> bool:
        return self.base_url.startswith("https://")

    @property
    def allowed_emails(self) -> frozenset[str]:
        return frozenset(
            part.strip().lower() for part in self.allowed_emails_raw.split(",") if part.strip()
        )

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host)

    @property
    def combine_provider(self) -> str | None:
        """The AI service used for Combine and template drafts, or None when none is set up.

        ORBIT_AI_PROVIDER decides when it is set. Otherwise Anthropic is used when its key is
        set, so existing servers keep working, then Gemini, then an OpenAI-compatible service.
        """
        if self.ai_provider:
            return self.ai_provider
        if self.anthropic_api_key:
            return "anthropic"
        if self.gemini_api_key:
            return "gemini"
        if self.openai_ready:
            return "openai"
        return None

    @property
    def openai_ready(self) -> bool:
        return bool(self.openai_model.strip()) and bool(self.openai_api_key or self.openai_base_url)

    @property
    def openai_endpoint(self) -> str:
        return self.openai_base_url or OPENAI_DEFAULT_BASE_URL

    @property
    def billing_enabled(self) -> bool:
        """Paid plans are on only when Stripe is fully set up."""
        return all(
            (
                self.stripe_secret_key,
                self.stripe_webhook_secret,
                self.stripe_price_plus_monthly,
                self.stripe_price_plus_yearly,
                self.stripe_price_ai_pack,
                self.stripe_price_email_pack,
            )
        )

    @property
    def combine_enabled(self) -> bool:
        return self.combine_provider is not None

    @property
    def backups_enabled(self) -> bool:
        return bool(self.backup_s3_bucket)

    @property
    def transport_allowed_hosts(self) -> list[str]:
        hosts = {self.base_host, self.base_hostname, "localhost:*", "127.0.0.1:*", "[::1]:*"}
        hosts.add(f"{self.base_hostname}:*")
        return sorted(hosts)

    @property
    def transport_allowed_origins(self) -> list[str]:
        return sorted({self.base_url, "http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*"})

    def require_runtime(self) -> None:
        if len(self.secret_key) < MIN_SECRET_LENGTH:
            raise SettingsError(
                "ORBIT_SECRET_KEY is missing or shorter than 32 characters. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
