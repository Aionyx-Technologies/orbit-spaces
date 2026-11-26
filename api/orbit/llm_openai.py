from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Sequence
from typing import Any

import httpx

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

ATTEMPTS = 3
RETRY_STATUSES = frozenset({408, 409, 429, 500, 502, 503, 504})
BACKOFF_SECONDS = 0.5
OPENAI_HOST = "api.openai.com"
LOGGED_FIELD_MAX = 60
REASONING_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

Sleeper = Callable[[float], None]


def _error_label(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""
    error = body.get("error") if isinstance(body, dict) else None
    if not isinstance(error, dict):
        return ""
    labels = [str(error[key])[:LOGGED_FIELD_MAX] for key in ("type", "code") if error.get(key)]
    return " ".join(labels)


class _OpenAIService:
    def __init__(
        self,
        settings: Settings,
        timeout: float = COMBINE_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
        sleep: Sleeper = time.sleep,
    ) -> None:
        self._model = settings.openai_model
        self._url = f"{settings.openai_endpoint}/chat/completions"
        self._official = httpx.URL(self._url).host == OPENAI_HOST
        self._headers = {"Content-Type": "application/json"}
        if settings.openai_api_key:
            self._headers["Authorization"] = f"Bearer {settings.openai_api_key}"
        self._timeout = timeout
        self._transport = transport
        self._sleep = sleep

    def _payload(
        self, system: str, user_message: str, max_tokens: int, json_reply: bool
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            "stream": False,
        }
        payload["max_completion_tokens" if self._official else "max_tokens"] = max_tokens
        if json_reply:
            payload["response_format"] = {"type": "json_object"}
        return payload

    def _post(self, payload: dict[str, Any]) -> httpx.Response:
        failure: CombineFailed | None = None
        for attempt in range(ATTEMPTS):
            if attempt:
                self._sleep(BACKOFF_SECONDS * 2 ** (attempt - 1))
            try:
                with httpx.Client(
                    timeout=self._timeout, transport=self._transport, follow_redirects=False
                ) as client:
                    response = client.post(self._url, headers=self._headers, json=payload)
            except httpx.TimeoutException as exc:
                failure = CombineFailed(TIMED_OUT)
                failure.__cause__ = exc
                continue
            except httpx.TransportError as exc:
                failure = CombineFailed(UNREACHABLE)
                failure.__cause__ = exc
                continue
            if response.status_code in RETRY_STATUSES and attempt < ATTEMPTS - 1:
                failure = self._failure(response)
                continue
            return response
        raise failure or CombineFailed(UNAVAILABLE)

    @staticmethod
    def _failure(response: httpx.Response) -> CombineFailed:
        status = response.status_code
        label = _error_label(response)
        if status in {401, 402, 403, 404}:
            logger.error(
                "The AI service answered %s %s. Check the key, model and address.", status, label
            )
            return CombineFailed(NOT_SET_UP)
        logger.warning("The AI service answered %s %s", status, label)
        if status in {429, 503}:
            return CombineFailed(BUSY)
        if status in {408, 504}:
            return CombineFailed(TIMED_OUT)
        return CombineFailed(UNAVAILABLE)

    def _ask(
        self, system: str, user_message: str, max_tokens: int, json_reply: bool = False
    ) -> str:
        response = self._post(self._payload(system, user_message, max_tokens, json_reply))
        if response.status_code != 200:
            raise self._failure(response)
        return self._text_of(response)

    @staticmethod
    def _text_of(response: httpx.Response) -> str:
        try:
            body = response.json()
            choice = body["choices"][0]
            message = choice["message"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            logger.warning("The AI service answered in a shape Orbit does not understand.")
            raise CombineFailed(UNAVAILABLE) from exc
        if choice.get("finish_reason") == "content_filter" or message.get("refusal"):
            raise CombineFailed(DECLINED)
        content = message.get("content")
        if isinstance(content, list):
            content = "".join(
                str(part.get("text", "")) for part in content if isinstance(part, dict)
            )
        text = REASONING_BLOCK.sub("", content).strip() if isinstance(content, str) else ""
        if not text:
            raise CombineFailed(EMPTY)
        return text


class OpenAICombiner(_OpenAIService):
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


class OpenAIDrafter(_OpenAIService):
    def __init__(
        self,
        settings: Settings,
        transport: httpx.BaseTransport | None = None,
        sleep: Sleeper = time.sleep,
    ) -> None:
        super().__init__(settings, DRAFT_TIMEOUT_SECONDS, transport, sleep)

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
