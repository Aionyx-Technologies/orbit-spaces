from __future__ import annotations

import io
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

from orbit.errors import InvalidInput, TooLong
from orbit.limits import (
    AVATAR_MAX_SIDE,
    AVATAR_QUALITY,
    AVATAR_SIZE,
    AVATAR_UPLOAD_MAX_BYTES,
)

ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})
MEGABYTE = 1024 * 1024
NOT_A_PICTURE = "That file is not a JPEG, PNG or WebP picture. Choose a different one."
TOO_LARGE = (
    f"That picture is larger than {AVATAR_UPLOAD_MAX_BYTES // MEGABYTE} MB. Choose a smaller one."
)
TOO_MANY_PIXELS = (
    f"That picture is more than {AVATAR_MAX_SIDE:,} pixels wide or tall. Choose a smaller one."
)
ANIMATED = "Animated pictures are not supported. Choose a still picture."
UNREADABLE = "That picture could not be read. Choose a different one."

Image.MAX_IMAGE_PIXELS = AVATAR_MAX_SIDE * AVATAR_MAX_SIDE


def _has_transparency(image: Image.Image) -> bool:
    return image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info


def process_avatar(raw: bytes) -> bytes:
    if len(raw) > AVATAR_UPLOAD_MAX_BYTES:
        raise TooLong(TOO_LARGE)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as opened:
                if opened.format not in ALLOWED_FORMATS:
                    raise InvalidInput(NOT_A_PICTURE)
                width, height = opened.size
                if width > AVATAR_MAX_SIDE or height > AVATAR_MAX_SIDE:
                    raise InvalidInput(TOO_MANY_PIXELS)
                if getattr(opened, "n_frames", 1) > 1:
                    raise InvalidInput(ANIMATED)
                opened.load()
                upright = ImageOps.exif_transpose(opened)
                flat = upright.convert("RGBA" if _has_transparency(upright) else "RGB")
                square = ImageOps.fit(
                    flat,
                    (AVATAR_SIZE, AVATAR_SIZE),
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
                encoded = io.BytesIO()
                square.save(encoded, format="WEBP", quality=AVATAR_QUALITY, method=4)
                return encoded.getvalue()
    except InvalidInput:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        ValueError,
        SyntaxError,
    ) as exc:
        raise InvalidInput(UNREADABLE) from exc
