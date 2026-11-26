from __future__ import annotations

import re

from orbit.errors import InvalidInput, TooLong

_CONTROL_EXCEPT_WHITESPACE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WHITESPACE_RUN = re.compile(r"\s+")


def clean_single_line(value: str, label: str, max_length: int) -> str:
    collapsed = _WHITESPACE_RUN.sub(" ", _CONTROL_EXCEPT_WHITESPACE.sub("", value)).strip()
    if not collapsed:
        raise InvalidInput(f"{label} cannot be empty.")
    if len(collapsed) > max_length:
        raise TooLong(f"{label} is too long. The limit is {max_length:,} characters.")
    return collapsed


def clean_block(value: str, label: str, max_length: int) -> str:
    normalized = _CONTROL_EXCEPT_WHITESPACE.sub("", value.replace("\r\n", "\n").replace("\r", "\n"))
    stripped = normalized.strip()
    if not stripped:
        raise InvalidInput(f"{label} cannot be empty.")
    if len(stripped) > max_length:
        raise TooLong(f"{label} is too long. The limit is {max_length:,} characters.")
    return stripped


def truncate(value: str, max_length: int) -> tuple[str, bool]:
    if len(value) <= max_length:
        return value, False
    return value[:max_length].rstrip(), True
