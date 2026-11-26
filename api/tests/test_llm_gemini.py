from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx2
import pytest
from google.genai import errors, types

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
from orbit.llm_gemini import GeminiCombiner, GeminiDrafter, supports_thinking_level
from orbit.space_templates import builtin_templates
from tests.conftest import SECRET_KEY

MOMENT = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)
FACT = FactInput("Dates", "Dec 20 to 23", "Alex", "ChatGPT", MOMENT)
ITEM = ItemInput("Morning flight", "Leaves at 7:10", "Blake", "Grok", MOMENT)


def reply(
    *parts: types.Part,
    finish: types.FinishReason = types.FinishReason.STOP,
    block: types.BlockedReason | None = None,
) -> types.GenerateContentResponse:
    candidates = (
        []
        if block
        else [
            types.Candidate(
                content=types.Content(
                    role="model", parts=list(parts or [types.Part(text="Plan text")])
                ),
                finish_reason=finish,
            )
        ]
    )
    feedback = types.GenerateContentResponsePromptFeedback(block_reason=block) if block else None
    return types.GenerateContentResponse(candidates=candidates, prompt_feedback=feedback)


def api_error(
    code: int, status: str, message: str = "x", reason: str | None = None
) -> errors.APIError:
    error: dict[str, Any] = {"code": code, "status": status, "message": message}
    if reason:
        error["details"] = [
            {"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": reason},
            {"@type": "type.googleapis.com/google.rpc.LocalizedMessage", "message": message},
        ]
    body = {"error": error}
    if code >= 500:
        return errors.ServerError(code, body)
    return errors.ClientError(code, body)


class FakeClient:
    def __init__(self, outcome: Any = None) -> None:
        self.outcome = outcome if outcome is not None else reply()
        self.calls: list[dict[str, Any]] = []
        self.models = SimpleNamespace(generate_content=self._generate)

    def _generate(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def settings(model: str = "gemini-4-hydrogen") -> Settings:
    return Settings(
        _env_file=None, secret_key=SECRET_KEY, gemini_api_key="gm-test", gemini_model=model
    )


def combine(client: FakeClient, model: str = "gemini-4-hydrogen") -> str:
    return GeminiCombiner(settings(model), client)([FACT], [ITEM], "focus on the budget")


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("gemini-4-hydrogen", True),
        ("gemini-4-carbon", True),
        ("gemini-3.8-flash", True),
        ("gemini-3.5-flash-lite", True),
        ("gemini-2.5-flash-lite", False),
        ("some-other-model", False),
    ],
)
def test_thinking_level_is_only_sent_to_models_that_accept_it(model: str, expected: bool) -> None:
    assert supports_thinking_level(model) is expected


def test_the_request_carries_the_shared_prompt_rules_and_material() -> None:
    client = FakeClient()

    text = combine(client)

    assert text == "Plan text"
    call = client.calls[0]
    assert call["model"] == "gemini-4-hydrogen"
    assert "Dates: Dec 20 to 23" in call["contents"]
    assert "Request:\nfocus on the budget" in call["contents"]
    config: types.GenerateContentConfig = call["config"]
    assert config.system_instruction == SYSTEM_PROMPT
    assert config.max_output_tokens == COMBINE_MAX_OUTPUT_TOKENS
    assert config.candidate_count == 1
    assert config.thinking_config is not None
    assert config.thinking_config.thinking_level == types.ThinkingLevel.MEDIUM
    assert config.temperature is None
    assert config.response_mime_type is None


def test_older_models_get_no_thinking_level() -> None:
    client = FakeClient()

    combine(client, "gemini-2.5-flash-lite")

    assert client.calls[0]["config"].thinking_config is None


def test_a_template_draft_asks_for_json() -> None:
    client = FakeClient(reply(types.Part(text='{"name": "Trip"}')))

    text = GeminiDrafter(settings(), client)("A weekend away")

    config: types.GenerateContentConfig = client.calls[0]["config"]
    assert text == '{"name": "Trip"}'
    assert config.system_instruction == DRAFT_SYSTEM_PROMPT
    assert config.max_output_tokens == DRAFT_MAX_OUTPUT_TOKENS
    assert config.response_mime_type == "application/json"
    assert "A weekend away" in client.calls[0]["contents"]


def test_thoughts_are_left_out_and_text_parts_are_joined() -> None:
    client = FakeClient(
        reply(
            types.Part(text="private reasoning", thought=True),
            types.Part(text="Part one. "),
            types.Part(text="Part two."),
        )
    )

    assert combine(client) == "Part one. Part two."


def test_a_plan_cut_short_by_the_token_limit_is_still_returned() -> None:
    client = FakeClient(
        reply(types.Part(text="Partial plan"), finish=types.FinishReason.MAX_TOKENS)
    )

    assert combine(client) == "Partial plan"


@pytest.mark.parametrize(
    "response",
    [
        reply(block=types.BlockedReason.SAFETY),
        reply(block=types.BlockedReason.PROHIBITED_CONTENT),
        reply(types.Part(text="half"), finish=types.FinishReason.SAFETY),
        reply(types.Part(text="half"), finish=types.FinishReason.PROHIBITED_CONTENT),
        reply(types.Part(text="half"), finish=types.FinishReason.RECITATION),
    ],
    ids=["blocked-safety", "blocked-prohibited", "safety", "prohibited", "recitation"],
)
def test_a_blocked_answer_is_reported_not_returned_as_a_plan(
    response: types.GenerateContentResponse,
) -> None:
    with pytest.raises(CombineFailed) as raised:
        combine(FakeClient(response))

    assert raised.value.message == DECLINED


@pytest.mark.parametrize(
    "response",
    [
        types.GenerateContentResponse(candidates=[]),
        reply(types.Part(text="   ")),
        reply(types.Part(text="only thinking", thought=True)),
        types.GenerateContentResponse(
            candidates=[types.Candidate(finish_reason=types.FinishReason.STOP)]
        ),
    ],
    ids=["no-candidates", "blank", "thoughts-only", "no-content"],
)
def test_an_answer_with_no_text_is_an_error(response: types.GenerateContentResponse) -> None:
    with pytest.raises(CombineFailed) as raised:
        combine(FakeClient(response))

    assert raised.value.message == EMPTY


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (api_error(429, "RESOURCE_EXHAUSTED"), BUSY),
        (api_error(400, "INVALID_ARGUMENT", "API key not valid. [API_KEY_INVALID]"), NOT_SET_UP),
        (
            api_error(400, "INVALID_ARGUMENT", "API key not valid.", reason="API_KEY_INVALID"),
            NOT_SET_UP,
        ),
        (api_error(402, "RESOURCE_EXHAUSTED", "Your prepayment credits are depleted."), NOT_SET_UP),
        (api_error(403, "PERMISSION_DENIED"), NOT_SET_UP),
        (api_error(401, "UNAUTHENTICATED"), NOT_SET_UP),
        (api_error(503, "UNAVAILABLE", "The model is overloaded."), BUSY),
        (api_error(504, "DEADLINE_EXCEEDED"), TIMED_OUT),
        (api_error(500, "INTERNAL"), UNAVAILABLE),
        (api_error(404, "NOT_FOUND", "models/gemini-9 is not found"), UNAVAILABLE),
        (api_error(400, "INVALID_ARGUMENT", "Bad request"), UNAVAILABLE),
        (httpx2.ReadTimeout("slow"), TIMED_OUT),
        (httpx2.ConnectError("down"), UNREACHABLE),
    ],
)
def test_service_problems_become_short_actionable_messages(error: Exception, message: str) -> None:
    with pytest.raises(CombineFailed) as raised:
        combine(FakeClient(error))

    assert raised.value.message == message


def test_the_real_client_gets_the_key_a_timeout_in_milliseconds_and_retries() -> None:
    combiner = GeminiCombiner(settings())

    client = combiner._client
    options = client._api_client._http_options
    assert client._api_client.api_key == "gm-test"
    assert options.timeout == 120_000
    assert options.retry_options is not None
    assert options.retry_options.attempts == 3


def test_a_refusal_is_logged_with_googles_reason_and_without_the_key(
    caplog: pytest.LogCaptureFixture,
) -> None:
    blocked = api_error(
        403,
        "PERMISSION_DENIED",
        "Requests to this API generativelanguage.googleapis.com are blocked.",
        reason="API_KEY_SERVICE_BLOCKED",
    )

    with caplog.at_level("ERROR", logger="orbit.llm"), pytest.raises(CombineFailed):
        combine(FakeClient(blocked))

    logged = caplog.records[-1].getMessage()
    assert "403 PERMISSION_DENIED (API_KEY_SERVICE_BLOCKED)" in logged
    assert "are blocked" in logged
    assert "gm-test" not in logged


def test_other_failures_are_logged_with_status_and_message(
    caplog: pytest.LogCaptureFixture,
) -> None:
    missing = api_error(404, "NOT_FOUND", "models/gemini-9 is not found " + "x" * 1000)

    with caplog.at_level("WARNING", logger="orbit.llm"), pytest.raises(CombineFailed):
        combine(FakeClient(missing))

    logged = caplog.records[-1].getMessage()
    assert "404 NOT_FOUND - models/gemini-9 is not found" in logged
    assert len(logged) < 400


def test_vertex_mode_sends_the_key_to_vertex_ai_express() -> None:
    vertex = Settings(
        _env_file=None,
        secret_key=SECRET_KEY,
        gemini_api_key="vx-test",
        gemini_use_vertex=True,
    )

    api = GeminiCombiner(vertex)._client._api_client

    assert api.vertexai is True
    assert api.api_key == "vx-test"
    assert api._http_options.base_url == "https://aiplatform.googleapis.com/"
    assert GeminiCombiner(settings())._client._api_client.vertexai is False


def test_a_space_suggestion_asks_for_json_with_the_suggest_prompt() -> None:
    client = FakeClient(reply(types.Part(text='{"base": "trip"}')))

    text = GeminiDrafter(settings(), client).suggest("Goa trip", list(builtin_templates().values()))

    config: types.GenerateContentConfig = client.calls[0]["config"]
    assert text == '{"base": "trip"}'
    assert config.system_instruction == SUGGEST_SYSTEM_PROMPT
    assert config.response_mime_type == "application/json"
    assert "Goa trip" in client.calls[0]["contents"]
