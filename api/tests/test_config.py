from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from orbit.config import Settings, SettingsError
from orbit.llm import AnthropicCombiner, AnthropicDrafter
from orbit.llm_gemini import GeminiCombiner, GeminiDrafter
from orbit.llm_openai import OpenAICombiner, OpenAIDrafter
from orbit.main import build_combiner, build_drafter
from tests.conftest import SECRET_KEY


def make_settings(**overrides: Any) -> Settings:
    return Settings(_env_file=None, secret_key=SECRET_KEY, **overrides)


def test_base_url_is_normalised() -> None:
    assert (
        make_settings(base_url="https://orbit.example.com/").base_url == "https://orbit.example.com"
    )


@pytest.mark.parametrize(
    "bad",
    [
        "orbit.example.com",
        "ftp://orbit.example.com",
        "https://orbit.example.com/app",
        "https://orbit.example.com?x=1",
        "http://orbit.example.com",
    ],
)
def test_base_url_must_be_a_bare_https_origin(bad: str) -> None:
    with pytest.raises((ValidationError, SettingsError)):
        make_settings(base_url=bad)


@pytest.mark.parametrize("local", ["http://localhost:3000", "http://127.0.0.1:8000"])
def test_plain_http_is_allowed_only_for_localhost(local: str) -> None:
    settings = make_settings(base_url=local)

    assert settings.secure_cookies is False
    assert settings.mcp_url == f"{local}/mcp"


def test_https_base_urls_use_secure_cookies() -> None:
    assert make_settings(base_url="https://orbit.example.com").secure_cookies is True


def test_allowed_emails_are_parsed_lowercased_and_trimmed() -> None:
    settings = make_settings(allowed_emails_raw=" Alex@Example.com, blake@example.com ,, ")

    assert settings.allowed_emails == frozenset({"alex@example.com", "blake@example.com"})


def test_no_allowlist_means_open_sign_up() -> None:
    assert make_settings().allowed_emails == frozenset()


def test_a_short_secret_key_is_refused_at_startup() -> None:
    settings = Settings(_env_file=None, secret_key="short")

    with pytest.raises(SettingsError):
        settings.require_runtime()


def test_a_missing_secret_key_is_refused_at_startup() -> None:
    settings = Settings(_env_file=None)

    with pytest.raises(SettingsError):
        settings.require_runtime()


def test_feature_flags_follow_configuration() -> None:
    plain = make_settings()
    configured = make_settings(smtp_host="smtp.example.com", anthropic_api_key="sk-test")

    assert plain.smtp_configured is False
    assert plain.combine_enabled is False
    assert configured.smtp_configured is True
    assert configured.combine_enabled is True


@pytest.mark.parametrize(
    ("keys", "expected"),
    [
        ({}, None),
        ({"anthropic_api_key": "sk-test"}, "anthropic"),
        ({"gemini_api_key": "gm-test"}, "gemini"),
        ({"anthropic_api_key": "sk-test", "gemini_api_key": "gm-test"}, "anthropic"),
        ({"openai_api_key": "sk-test", "openai_model": "gpt-test"}, "openai"),
        ({"openai_base_url": "http://localhost:11434/v1", "openai_model": "llama3"}, "openai"),
        ({"openai_model": "gpt-test"}, None),
        ({"openai_api_key": "sk-test"}, None),
        ({"gemini_api_key": "gm-test", "openai_api_key": "k", "openai_model": "m"}, "gemini"),
        (
            {"anthropic_api_key": "sk-test", "gemini_api_key": "gm-test", "ai_provider": "Gemini"},
            "gemini",
        ),
    ],
)
def test_the_ai_provider_follows_the_keys_unless_chosen(
    keys: dict[str, str], expected: str | None
) -> None:
    settings = make_settings(**keys)

    assert settings.combine_provider == expected
    assert settings.combine_enabled is (expected is not None)


def test_the_gemini_model_defaults_to_gemini_4_hydrogen() -> None:
    assert make_settings().gemini_model == "gemini-4-hydrogen"


@pytest.mark.parametrize(
    "keys",
    [
        {"ai_provider": "mistral", "anthropic_api_key": "sk-test"},
        {"ai_provider": "openai", "anthropic_api_key": "sk-test"},
        {"ai_provider": "openai", "openai_api_key": "sk-test"},
        {"ai_provider": "openai", "openai_model": "gpt-test"},
        {"ai_provider": "gemini", "anthropic_api_key": "sk-test"},
        {"ai_provider": "anthropic", "gemini_api_key": "gm-test"},
    ],
)
def test_a_chosen_provider_must_be_known_and_have_a_key(keys: dict[str, str]) -> None:
    with pytest.raises(ValueError, match="ORBIT_AI_PROVIDER"):
        make_settings(**keys)


@pytest.mark.parametrize(
    ("keys", "combiner", "drafter"),
    [
        ({"anthropic_api_key": "sk-test"}, AnthropicCombiner, AnthropicDrafter),
        ({"gemini_api_key": "gm-test"}, GeminiCombiner, GeminiDrafter),
        (
            {"openai_base_url": "http://localhost:11434/v1", "openai_model": "llama3"},
            OpenAICombiner,
            OpenAIDrafter,
        ),
    ],
)
def test_the_server_builds_the_chosen_providers_clients(
    keys: dict[str, str], combiner: type, drafter: type
) -> None:
    settings = make_settings(**keys)

    assert isinstance(build_combiner(settings, None), combiner)
    assert isinstance(build_drafter(settings, None), drafter)


def test_the_openai_address_defaults_to_openai_and_is_tidied() -> None:
    assert make_settings().openai_endpoint == "https://api.openai.com/v1"
    assert (
        make_settings(openai_base_url=" http://ollama:11434/v1/ ").openai_endpoint
        == "http://ollama:11434/v1"
    )


@pytest.mark.parametrize(
    "bad",
    [
        "localhost:11434/v1",
        "ftp://localhost/v1",
        "https://user:pass@example.com/v1",
        "https://example.com/v1?key=1",
    ],
)
def test_the_openai_address_must_be_a_plain_http_url(bad: str) -> None:
    with pytest.raises(ValueError, match="OPENAI_BASE_URL"):
        make_settings(openai_base_url=bad)


def test_no_key_means_no_ai_clients() -> None:
    assert build_combiner(make_settings(), None) is None
    assert build_drafter(make_settings(), None) is None


def test_transport_security_allows_the_public_host_and_localhost_only() -> None:
    settings = make_settings(base_url="https://orbit.example.com")

    assert "orbit.example.com" in settings.transport_allowed_hosts
    assert "localhost:*" in settings.transport_allowed_hosts
    assert "evil.example" not in settings.transport_allowed_hosts
    assert "https://orbit.example.com" in settings.transport_allowed_origins


def test_limit_settings_default_to_unlimited() -> None:
    settings = make_settings()

    assert settings.max_created_spaces == 0
    assert settings.max_update_emails_per_day == 0


def test_limit_settings_read_env_names_and_reject_negatives(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ORBIT_MAX_CREATED_SPACES", "5")
    monkeypatch.setenv("ORBIT_MAX_UPDATE_EMAILS_PER_DAY", "7")
    settings = make_settings()
    assert settings.max_created_spaces == 5
    assert settings.max_update_emails_per_day == 7

    with pytest.raises(ValidationError):
        make_settings(max_created_spaces=-1)
