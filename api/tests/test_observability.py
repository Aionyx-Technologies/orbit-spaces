from __future__ import annotations

import sys

import pytest

from orbit.config import Settings
from orbit.observability import init_error_tracking, scrub_event
from tests.conftest import SECRET_KEY


def event_with_everything() -> dict[str, object]:
    return {
        "request": {
            "method": "POST",
            "url": "https://orbit.example/api/invites/the-secret-token?x=1&token=abc",
            "query_string": "token=abc",
            "data": {"content": "Private words"},
            "cookies": {"orbit_session": "secret"},
            "headers": {"Authorization": "Bearer secret", "Cookie": "orbit_session=secret"},
            "env": {"REMOTE_ADDR": "10.0.0.1"},
        },
        "user": {"email": "alex@example.com", "ip_address": "10.0.0.1"},
        "extra": {"item_content": "Private words"},
        "breadcrumbs": {
            "values": [{"message": "Sign-in link https://orbit.example/auth/verify?token=abc"}]
        },
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": "Something broke",
                    "stacktrace": {
                        "frames": [
                            {"function": "share_item", "vars": {"content": "Private words"}},
                            {"function": "commit"},
                        ]
                    },
                },
                {"type": "KeyError", "value": "no stacktrace here"},
            ]
        },
    }


def test_nothing_personal_survives_the_scrubber() -> None:
    scrubbed = scrub_event(event_with_everything())

    request = scrubbed["request"]
    assert request == {
        "method": "POST",
        "url": "https://orbit.example/api/invites/the-secret-token",
    }
    assert "user" not in scrubbed
    assert "extra" not in scrubbed
    assert scrubbed["breadcrumbs"] == {"values": []}
    frames = scrubbed["exception"]["values"][0]["stacktrace"]["frames"]
    assert all("vars" not in frame for frame in frames)
    assert [frame["function"] for frame in frames] == ["share_item", "commit"]
    assert "Private words" not in repr(scrubbed)
    assert "secret" not in repr(scrubbed).replace("the-secret-token", "")
    assert "alex@example.com" not in repr(scrubbed)


def test_events_without_requests_or_exceptions_are_fine() -> None:
    assert scrub_event({"message": "hello"}) == {"message": "hello", "breadcrumbs": {"values": []}}


def test_error_tracking_is_off_without_a_dsn() -> None:
    settings = Settings(_env_file=None, secret_key=SECRET_KEY)

    assert init_error_tracking(settings) is False


def test_a_missing_sentry_package_only_logs_a_warning(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setitem(sys.modules, "sentry_sdk", None)
    settings = Settings(_env_file=None, secret_key=SECRET_KEY, sentry_dsn="https://k@o.example/1")

    started = init_error_tracking(settings)

    assert started is False
    assert "sentry-sdk is not installed" in caplog.text


def test_enabling_it_turns_off_the_data_sentry_collects_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeSentry:
        @staticmethod
        def init(**options: object) -> None:
            captured.update(options)

    monkeypatch.setitem(sys.modules, "sentry_sdk", FakeSentry)
    settings = Settings(_env_file=None, secret_key=SECRET_KEY, sentry_dsn="https://k@o.example/1")

    started = init_error_tracking(settings)

    assert started is True
    assert captured["dsn"] == "https://k@o.example/1"
    assert captured["send_default_pii"] is False
    assert captured["max_request_body_size"] == "never"
    assert captured["include_local_variables"] is False
    assert captured["traces_sample_rate"] == 0.0
    assert captured["before_send"] is scrub_event
    assert str(captured["release"]).startswith("orbit@")
