from __future__ import annotations

from fastapi import Response

from orbit.limits import AVATAR_CACHE_SECONDS

PHOTO_HEADERS = {
    "Cache-Control": f"private, max-age={AVATAR_CACHE_SECONDS}, immutable",
    "X-Content-Type-Options": "nosniff",
}


def photo_response(data: bytes) -> Response:
    return Response(content=data, media_type="image/webp", headers=PHOTO_HEADERS)
