from __future__ import annotations

import io

import pytest
from PIL import Image

from orbit.errors import InvalidInput, TooLong
from orbit.images import (
    ANIMATED,
    NOT_A_PICTURE,
    TOO_LARGE,
    TOO_MANY_PIXELS,
    UNREADABLE,
    process_avatar,
)
from orbit.limits import AVATAR_MAX_SIDE, AVATAR_SIZE, AVATAR_UPLOAD_MAX_BYTES
from tests.image_helpers import encode

RED = (220, 30, 30)
GREEN = (30, 200, 30)
BLUE = (30, 30, 220)
ORIENTATION = 0x0112
GPS = 0x8825


def decoded(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def stripes(
    width: int, height: int, colours: tuple[tuple[int, int, int], ...], across: bool = True
):
    image = Image.new("RGB", (width, height))
    length = width if across else height
    for position in range(length):
        colour = colours[min(position * len(colours) // length, len(colours) - 1)]
        box = (position, 0, position + 1, height) if across else (0, position, width, position + 1)
        image.paste(colour, box)
    return image


def near(pixel: tuple[int, ...], expected: tuple[int, int, int]) -> bool:
    return all(
        abs(actual - wanted) < 45 for actual, wanted in zip(pixel[:3], expected, strict=True)
    )


@pytest.mark.parametrize("image_format", ["JPEG", "PNG", "WEBP"])
def test_each_allowed_format_becomes_a_256_square_webp(image_format: str) -> None:
    source = encode(stripes(500, 300, (RED, GREEN, BLUE)), image_format)

    result = decoded(process_avatar(source))

    assert result.format == "WEBP"
    assert result.size == (AVATAR_SIZE, AVATAR_SIZE)


def test_a_wide_picture_is_cropped_from_the_middle() -> None:
    wide = stripes(600, 200, (RED, GREEN, BLUE))

    result = decoded(process_avatar(encode(wide, "PNG"))).convert("RGB")

    for x in (4, 128, 251):
        assert near(result.getpixel((x, 128)), GREEN)


def test_a_tall_picture_is_cropped_from_the_middle() -> None:
    tall = stripes(200, 600, (RED, GREEN, BLUE), across=False)

    result = decoded(process_avatar(encode(tall, "PNG"))).convert("RGB")

    for y in (4, 128, 251):
        assert near(result.getpixel((128, y)), GREEN)


def test_the_rotation_a_phone_records_is_applied_before_the_metadata_is_dropped() -> None:
    exif = Image.Exif()
    exif[ORIENTATION] = 6
    sideways = stripes(120, 60, (RED, BLUE))

    result = decoded(process_avatar(encode(sideways, "JPEG", exif=exif))).convert("RGB")

    assert near(result.getpixel((128, 8)), RED)
    assert near(result.getpixel((128, 247)), BLUE)


def test_location_and_every_other_piece_of_metadata_is_removed() -> None:
    exif = Image.Exif()
    exif[0x010F] = "Phone Maker"
    exif[0x0132] = "2026:11:19 10:00:00"
    exif[GPS] = {1: "N", 2: (12.0, 58.0, 0.0), 3: "E", 4: (77.0, 35.0, 0.0)}
    source = encode(stripes(300, 300, (RED, BLUE)), "JPEG", exif=exif)
    assert Image.open(io.BytesIO(source)).getexif().get_ifd(GPS)

    result = process_avatar(source)

    stored = Image.open(io.BytesIO(result))
    assert len(stored.getexif()) == 0
    assert "exif" not in stored.info
    assert "icc_profile" not in stored.info
    assert b"EXIF" not in result
    assert b"Phone Maker" not in result


def test_a_transparent_picture_keeps_its_transparency() -> None:
    image = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    image.paste((200, 20, 20, 255), (100, 100, 200, 200))

    result = decoded(process_avatar(encode(image, "PNG")))

    assert result.mode == "RGBA"
    assert result.getpixel((2, 2))[3] == 0
    assert result.getpixel((128, 128))[3] == 255


@pytest.mark.parametrize("mode", ["L", "P", "CMYK"])
def test_other_colour_modes_are_accepted(mode: str) -> None:
    image = stripes(200, 200, (RED, BLUE)).convert(mode)
    image_format = "JPEG" if mode in {"CMYK", "L"} else "PNG"

    result = decoded(process_avatar(encode(image, image_format)))

    assert result.size == (AVATAR_SIZE, AVATAR_SIZE)


def test_an_animated_webp_or_png_is_refused() -> None:
    first = stripes(64, 64, (RED, BLUE))
    second = stripes(64, 64, (GREEN, BLUE))

    for image_format in ("WEBP", "PNG"):
        source = encode(first, image_format, save_all=True, append_images=[second], duration=100)

        with pytest.raises(InvalidInput) as raised:
            process_avatar(source)

        assert raised.value.message == ANIMATED


@pytest.mark.parametrize("image_format", ["GIF", "BMP", "TIFF"])
def test_a_real_picture_in_another_format_is_refused(image_format: str) -> None:
    source = encode(stripes(64, 64, (RED, BLUE)), image_format)

    with pytest.raises(InvalidInput) as raised:
        process_avatar(source)

    assert raised.value.message == NOT_A_PICTURE


@pytest.mark.parametrize(
    "not_a_picture",
    [
        b"",
        b"hello there",
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        b"\x89PNG\r\n\x1a\nnot really",
        b"%PDF-1.7 nothing",
    ],
)
def test_a_file_that_is_not_a_picture_is_refused_with_a_plain_message(
    not_a_picture: bytes,
) -> None:
    with pytest.raises(InvalidInput) as raised:
        process_avatar(not_a_picture)

    assert raised.value.message == UNREADABLE


def test_a_cut_off_picture_is_refused() -> None:
    whole = encode(stripes(400, 400, (RED, GREEN, BLUE)), "JPEG")

    with pytest.raises(InvalidInput) as raised:
        process_avatar(whole[: len(whole) // 2])

    assert raised.value.message == UNREADABLE


def test_a_file_over_the_size_limit_is_refused_before_it_is_read() -> None:
    with pytest.raises(TooLong) as raised:
        process_avatar(b"x" * (AVATAR_UPLOAD_MAX_BYTES + 1))

    assert raised.value.message == TOO_LARGE
    assert "5 MB" in raised.value.message


def test_a_picture_over_six_thousand_pixels_on_a_side_is_refused() -> None:
    too_wide = encode(Image.new("RGB", (AVATAR_MAX_SIDE + 1, 4), BLUE), "PNG")
    too_tall = encode(Image.new("RGB", (4, AVATAR_MAX_SIDE + 1), BLUE), "PNG")

    for source in (too_wide, too_tall):
        with pytest.raises(InvalidInput) as raised:
            process_avatar(source)
        assert raised.value.message == TOO_MANY_PIXELS


def test_a_picture_exactly_six_thousand_pixels_wide_is_allowed() -> None:
    source = encode(Image.new("RGB", (AVATAR_MAX_SIDE, 4), BLUE), "PNG")

    assert decoded(process_avatar(source)).size == (AVATAR_SIZE, AVATAR_SIZE)


def test_the_stored_picture_is_small() -> None:
    noisy = Image.effect_noise((900, 900), 80).convert("RGB")

    assert len(process_avatar(encode(noisy, "JPEG", quality=95))) < 60_000


def test_processing_does_not_change_the_global_image_limit_the_server_relies_on() -> None:
    assert Image.MAX_IMAGE_PIXELS == AVATAR_MAX_SIDE * AVATAR_MAX_SIDE
