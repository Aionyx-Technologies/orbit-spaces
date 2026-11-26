from __future__ import annotations

import io
from typing import Any

from PIL import Image


def encode(image: Image.Image, image_format: str, **options: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=image_format, **options)
    return buffer.getvalue()


def picture(
    colour: tuple[int, int, int] = (40, 90, 200),
    size: tuple[int, int] = (320, 240),
    image_format: str = "JPEG",
) -> bytes:
    return encode(Image.new("RGB", size, colour), image_format)
