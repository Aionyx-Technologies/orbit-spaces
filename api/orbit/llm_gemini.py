"""Combine and template drafts through Google's Gemini API.

The prompts, the error messages people see and the Combiner and TemplateDrafter shapes all
come from orbit.llm, so the rest of Orbit does not care which AI service answers.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

import httpx
import httpx2
from google import genai
from google.genai import errors, types

from orbit.config import Settings
from orbit.limits import (
    COMBINE_MAX_OUTPUT_TOKENS,
    COMBINE_TIMEOUT_SECONDS,
    DRAFT_MAX_OUTPUT_TOKENS,
    DRAFT_TIMEOUT_SECONDS,
)
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
    build_draft_message,
    build_suggest_message,
    build_user_message,
)
from orbit.space_templates import SpaceTemplate

logger = logging.getLogger("orbit.llm")

# The same amount of thinking Orbit asks Claude for. Gemini 4 models think at "high" by
# default, which is slower and costs more without making a combined plan much better.
THINKING_LEVEL = types.ThinkingLevel.MEDIUM
THINKING_LEVEL_PREFIXES = ("gemini-3", "gemini-4")
# The first try plus two retries, matching the Anthropic client. The SDK retries 408, 429
# and 5xx answers on its own.
ATTEMPTS = 3

# Gemini says why it stopped. These mean it would not answer the material, so the person
# is told it declined rather than shown a half-written plan.
DECLINED_FINISH_REASONS = frozenset(
    {
        types.FinishReason.SAFETY,
        types.FinishReason.PROHIBITED_CONTENT,
        types.FinishReason.BLOCKLIST,
        types.FinishReason.SPII,
        types.FinishReason.RECITATION,
    }
)
TIMEOUT_ERRORS: tuple[type[Exception], ...] = (httpx.TimeoutException, httpx2.TimeoutException)
CONNECTION_ERRORS: tuple[type[Exception], ...] = (httpx.TransportError, httpx2.TransportError)


def supports_thinking_level(model: str) -> bool:
    return model.startswith(THINKING_LEVEL_PREFIXES)


LOGGED_MESSAGE_MAX = 300


def _reasons(exc: errors.APIError) -> list[str]:
    """The machine-readable reasons Google gives, such as API_KEY_SERVICE_BLOCKED."""
    body = exc.details if isinstance(exc.details, dict) else {}
    error = body.get("error", body)
    details = error.get("details") if isinstance(error, dict) else None
    if not isinstance(details, list):
        return []
    return [
        str(detail["reason"])
        for detail in details
        if isinstance(detail, dict) and isinstance(detail.get("reason"), str)
    ]


def _describe(exc: errors.APIError) -> str:
    # Google's error bodies never contain the API key, so they are safe to log, and they
    # say what to fix: a blocked API, a restricted key, an empty prepaid balance.
    parts = [str(exc.code), exc.status or ""]
    reasons = _reasons(exc)
    if reasons:
        parts.append(f"({', '.join(reasons)})")
    if exc.message:
        parts.append(f"- {exc.message.strip()[:LOGGED_MESSAGE_MAX]}")
    return " ".join(part for part in parts if part)


def _is_set_up_wrongly(exc: errors.APIError) -> bool:
    # A wrong key is 400 with the reason API_KEY_INVALID, a refused key or project 401 or
    # 403, and an empty prepaid balance 402. Only whoever runs Orbit can fix those.
    if exc.code in {401, 402, 403}:
        return True
    return any("API_KEY_INVALID" in text for text in [*_reasons(exc), exc.message or ""])


class _GeminiService:
    def __init__(
        self,
        settings: Settings,
        client: Any = None,
        timeout: float = COMBINE_TIMEOUT_SECONDS,
    ) -> None:
        self._model = settings.gemini_model
        # With vertexai and only an API key, the SDK uses Vertex AI express mode on
        # aiplatform.googleapis.com, billed through Google Cloud instead of the Gemini API.
        self._client = client or genai.Client(
            vertexai=settings.gemini_use_vertex,
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=int(timeout * 1000),
                retry_options=types.HttpRetryOptions(attempts=ATTEMPTS),
            ),
        )

    def _config(
        self, system: str, max_tokens: int, json_reply: bool = False
    ) -> types.GenerateContentConfig:
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            candidate_count=1,
        )
        if supports_thinking_level(self._model):
            config.thinking_config = types.ThinkingConfig(thinking_level=THINKING_LEVEL)
        if json_reply:
            config.response_mime_type = "application/json"
        return config

    def _ask(
        self, system: str, user_message: str, max_tokens: int, json_reply: bool = False
    ) -> str:
        config = self._config(system, max_tokens, json_reply)
        try:
            response = self._client.models.generate_content(
                model=self._model, contents=user_message, config=config
            )
        except errors.APIError as exc:
            raise self._failure(exc) from exc
        except TIMEOUT_ERRORS as exc:
            raise CombineFailed(TIMED_OUT) from exc
        except CONNECTION_ERRORS as exc:
            raise CombineFailed(UNREACHABLE) from exc
        return self._text_of(response)

    @staticmethod
    def _failure(exc: errors.APIError) -> CombineFailed:
        description = _describe(exc)
        if _is_set_up_wrongly(exc):
            logger.error("The AI service refused Orbit's key or project: %s", description)
            return CombineFailed(NOT_SET_UP)
        logger.warning("The AI service answered %s", description)
        if exc.code in {429, 503}:
            return CombineFailed(BUSY)
        if exc.code == 504:
            return CombineFailed(TIMED_OUT)
        return CombineFailed(UNAVAILABLE)

    @staticmethod
    def _text_of(response: types.GenerateContentResponse) -> str:
        feedback = response.prompt_feedback
        if feedback is not None and feedback.block_reason is not None:
            raise CombineFailed(DECLINED)
        if not response.candidates:
            raise CombineFailed(EMPTY)
        candidate = response.candidates[0]
        if candidate.finish_reason in DECLINED_FINISH_REASONS:
            raise CombineFailed(DECLINED)
        parts = candidate.content.parts if candidate.content and candidate.content.parts else []
        text = "".join(part.text for part in parts if part.text and not part.thought).strip()
        if not text:
            raise CombineFailed(EMPTY)
        return text


class GeminiCombiner(_GeminiService):
    def __call__(
        self,
        memory: Sequence[FactInput],
        items: Sequence[ItemInput],
        instruction: str | None,
        omitted_items: int = 0,
        template: SpaceTemplate | None = None,
    ) -> str:
        message = build_user_message(memory, items, instruction, omitted_items, template)
        return self._ask(SYSTEM_PROMPT, message, COMBINE_MAX_OUTPUT_TOKENS)


class GeminiDrafter(_GeminiService):
    def __init__(self, settings: Settings, client: Any = None) -> None:
        super().__init__(settings, client, DRAFT_TIMEOUT_SECONDS)

    def __call__(self, purpose: str) -> str:
        return self._ask(
            DRAFT_SYSTEM_PROMPT,
            build_draft_message(purpose),
            DRAFT_MAX_OUTPUT_TOKENS,
            json_reply=True,
        )

    def suggest(self, purpose: str, templates: Sequence[SpaceTemplate]) -> str:
        return self._ask(
            SUGGEST_SYSTEM_PROMPT,
            build_suggest_message(purpose, templates),
            DRAFT_MAX_OUTPUT_TOKENS,
            json_reply=True,
        )
