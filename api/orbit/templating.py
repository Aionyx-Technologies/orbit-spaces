from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"

_environment = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(enabled_extensions=("html",)),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)

BASE_CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'self'; "
    "base-uri 'none'; frame-ancestors 'none'"
)


def render(template: str, **context: Any) -> str:
    return _environment.get_template(template).render(**context)


def page(
    template: str,
    *,
    status_code: int = 200,
    form_action_self: bool = True,
    **context: Any,
) -> HTMLResponse:
    csp = f"{BASE_CSP}; form-action 'self'" if form_action_self else BASE_CSP
    return HTMLResponse(
        render(template, **context),
        status_code=status_code,
        headers={
            "Cache-Control": "no-store",
            "Content-Security-Policy": csp,
            "Referrer-Policy": "same-origin",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
        },
    )
