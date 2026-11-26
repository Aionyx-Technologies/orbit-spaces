from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from orbit.config import Settings
from orbit.limits import COMBINE_MAX_OUTPUT_TOKENS, DRAFT_MAX_OUTPUT_TOKENS
from orbit.llm import (
    BUSY,
    DECLINED,
    DRAFT_SYSTEM_PROMPT,
    EMPTY,
    NOT_SET_UP,
    SUGGEST_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    TIMED_OUT,
    UNAVAILABLE,
    UNREACHABLE,
    CombineFailed,
    FactInput,
    ItemInput,
)
from orbit.llm_openai import OpenAICombiner, OpenAIDrafter
from orbit.space_templates import builtin_templates
from tests.conftest import SECRET_KEY

MOMENT = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)
FACT = FactInput("Dates", "Dec 20 to 23", "Alex", "ChatGPT", MOMENT)
ITEM = ItemInput("Morning flight", "Leaves at 7:10", "Blake", "Grok", MOMENT)
KEY = "sk-never-logged-123"


def settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {"openai_api_key": KEY, "openai_model": "gpt-test"}
    values.update(overrides)
    return Settings(_env_file=None, secret_key=SECRET_KEY, **values)


def answer(text: Any = "Plan text", finish: str = "stop", **message: Any) -> httpx.Response:
    body = {
        "choices": [
            {"finish_reason": finish, "message": {"role": "assistant", "content": text, **message}}
        ]
    }
    return httpx.Response(200, json=body)


class Server:
    def __init__(self, *replies: httpx.Response | Exception) -> None:
        self.replies = list(replies)
        self.requests: list[httpx.Request] = []
        self.pauses: list[float] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    @property
    def sent(self) -> dict[str, Any]:
        body: dict[str, Any] = json.loads(self.requests[-1].content)
        return body


def combiner(server: Server, **overrides: Any) -> OpenAICombiner:
    return OpenAICombiner(
        settings(**overrides), transport=server.transport, sleep=server.pauses.append
    )


def drafter(server: Server, **overrides: Any) -> OpenAIDrafter:
    return OpenAIDrafter(
        settings(**overrides), transport=server.transport, sleep=server.pauses.append
    )


def test_a_combine_sends_the_prompt_and_returns_the_text() -> None:
    server = Server(answer("  The plan  "))

    text = combiner(server)([FACT], [ITEM], "Keep it short")

    assert text == "The plan"
    request = server.requests[0]
    assert str(request.url) == "https://api.openai.com/v1/chat/completions"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    sent = server.sent
    assert sent["model"] == "gpt-test"
    assert sent["stream"] is False
    assert sent["max_completion_tokens"] == COMBINE_MAX_OUTPUT_TOKENS
    assert "max_tokens" not in sent
    assert "response_format" not in sent
    assert sent["messages"][0] == {"role": "system", "content": SYSTEM_PROMPT}
    user = sent["messages"][1]
    assert user["role"] == "user"
    assert "Dec 20 to 23" in user["content"]
    assert "Leaves at 7:10" in user["content"]
    assert "Keep it short" in user["content"]


def test_a_local_server_needs_no_key_and_uses_the_older_token_field() -> None:
    server = Server(answer("Local plan"))

    text = combiner(
        server,
        openai_api_key="",
        openai_base_url="http://host.docker.internal:11434/v1/",
        openai_model="llama3.1",
    )([FACT], [], None)

    assert text == "Local plan"
    request = server.requests[0]
    assert str(request.url) == "http://host.docker.internal:11434/v1/chat/completions"
    assert "authorization" not in request.headers
    assert server.sent["max_tokens"] == COMBINE_MAX_OUTPUT_TOKENS
    assert "max_completion_tokens" not in server.sent


def test_the_drafter_asks_for_json_and_uses_its_own_prompts() -> None:
    server = Server(answer('{"name": "Trip"}'), answer('{"base": "trip"}'))
    openai_drafter = drafter(server)

    assert openai_drafter("A trip to Lisbon") == '{"name": "Trip"}'
    drafted = server.sent
    assert (
        openai_drafter.suggest("A trip to Lisbon", list(builtin_templates().values()))
        == '{"base": "trip"}'
    )
    suggested = server.sent

    assert drafted["messages"][0]["content"] == DRAFT_SYSTEM_PROMPT
    assert suggested["messages"][0]["content"] == SUGGEST_SYSTEM_PROMPT
    for sent in (drafted, suggested):
        assert sent["response_format"] == {"type": "json_object"}
        assert sent["max_completion_tokens"] == DRAFT_MAX_OUTPUT_TOKENS


def test_reasoning_blocks_and_part_lists_are_cleaned_up() -> None:
    thought = answer("<think>Let me work this out.\nStill thinking.</think>\n\nThe plan")
    assert combiner(Server(thought))([FACT], [], None) == "The plan"
    parts = answer([{"type": "text", "text": "One "}, {"type": "text", "text": "two"}])
    assert combiner(Server(parts))([FACT], [], None) == "One two"


@pytest.mark.parametrize(
    ("status", "message"),
    [
        (401, NOT_SET_UP),
        (402, NOT_SET_UP),
        (403, NOT_SET_UP),
        (404, NOT_SET_UP),
        (400, UNAVAILABLE),
        (422, UNAVAILABLE),
    ],
)
def test_a_refusal_is_not_retried_and_says_what_it_means(status: int, message: str) -> None:
    server = Server(httpx.Response(status, json={"error": {"type": "invalid_request_error"}}))

    with pytest.raises(CombineFailed) as raised:
        combiner(server)([FACT], [], None)

    assert raised.value.message == message
    assert len(server.requests) == 1
    assert server.pauses == []


@pytest.mark.parametrize(
    ("status", "message"),
    [(429, BUSY), (503, BUSY), (504, TIMED_OUT), (500, UNAVAILABLE), (502, UNAVAILABLE)],
)
def test_a_busy_service_is_retried_then_reported(status: int, message: str) -> None:
    server = Server(httpx.Response(status, json={"error": {"code": "busy"}}))

    with pytest.raises(CombineFailed) as raised:
        combiner(server)([FACT], [], None)

    assert raised.value.message == message
    assert len(server.requests) == 3
    assert server.pauses == [0.5, 1.0]


def test_a_retry_that_works_returns_the_answer() -> None:
    server = Server(httpx.Response(429, json={}), answer("Second time lucky"))

    assert combiner(server)([FACT], [], None) == "Second time lucky"
    assert len(server.requests) == 2


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (httpx.ReadTimeout("slow"), TIMED_OUT),
        (httpx.ConnectTimeout("slow"), TIMED_OUT),
        (httpx.ConnectError("refused"), UNREACHABLE),
    ],
)
def test_network_trouble_is_retried_then_reported(error: Exception, message: str) -> None:
    server = Server(error)

    with pytest.raises(CombineFailed) as raised:
        combiner(server)([FACT], [], None)

    assert raised.value.message == message
    assert len(server.requests) == 3


@pytest.mark.parametrize(
    ("reply", "message"),
    [
        (answer("Nope", finish="content_filter"), DECLINED),
        (answer(None, refusal="I cannot help with that."), DECLINED),
        (answer(""), EMPTY),
        (answer("   "), EMPTY),
        (answer(None), EMPTY),
        (answer("<think>only thinking</think>"), EMPTY),
        (httpx.Response(200, json={"choices": []}), UNAVAILABLE),
        (httpx.Response(200, json={"unexpected": True}), UNAVAILABLE),
        (httpx.Response(200, content=b"not json"), UNAVAILABLE),
    ],
)
def test_odd_answers_get_a_plain_message(reply: httpx.Response, message: str) -> None:
    with pytest.raises(CombineFailed) as raised:
        combiner(Server(reply))([FACT], [], None)

    assert raised.value.message == message


def test_the_key_and_the_shared_text_never_reach_the_log(caplog: pytest.LogCaptureFixture) -> None:
    secret_text = ItemInput("Passport number", "X1234567", "Blake", "Grok", MOMENT)
    bad_key = httpx.Response(
        401, json={"error": {"type": "invalid_request_error", "message": f"Bad key {KEY}"}}
    )

    with caplog.at_level("DEBUG"), pytest.raises(CombineFailed):
        combiner(Server(bad_key))([FACT], [secret_text], None)

    assert caplog.text
    assert KEY not in caplog.text
    assert "X1234567" not in caplog.text
    assert "invalid_request_error" in caplog.text


def test_redirects_are_not_followed() -> None:
    server = Server(httpx.Response(307, headers={"location": "http://169.254.169.254/"}))

    with pytest.raises(CombineFailed) as raised:
        combiner(server)([FACT], [], None)

    assert raised.value.message == UNAVAILABLE
    assert len(server.requests) == 1
