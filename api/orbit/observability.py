from __future__ import annotations

import logging
from typing import Any

from orbit import __version__
from orbit.config import Settings

logger = logging.getLogger("orbit")

REMOVED_REQUEST_KEYS = ("data", "cookies", "headers", "query_string", "env")


def scrub_event(event: Any, hint: Any = None) -> Any:
    request = event.get("request")
    if isinstance(request, dict):
        for key in REMOVED_REQUEST_KEYS:
            request.pop(key, None)
        url = request.get("url")
        if isinstance(url, str):
            request["url"] = url.split("?", 1)[0]
    event.pop("user", None)
    event.pop("extra", None)
    event["breadcrumbs"] = {"values": []}
    for exception in event.get("exception", {}).get("values", []):
        stacktrace = exception.get("stacktrace") or {}
        for frame in stacktrace.get("frames", []):
            frame.pop("vars", None)
    return event


def init_error_tracking(settings: Settings) -> bool:
    if not settings.sentry_dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed.")
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        release=f"orbit@{__version__}",
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        traces_sample_rate=0.0,
        before_send=scrub_event,
    )
    return True
