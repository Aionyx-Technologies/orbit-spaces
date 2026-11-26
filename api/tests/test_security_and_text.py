from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from orbit.errors import InvalidInput, TooLong
from orbit.security import (
    Signer,
    constant_time_equals,
    display_name_from_email,
    hash_token,
    new_token,
    normalize_email,
    rate_limit_address,
    safe_next_path,
)
from orbit.text import clean_block, clean_single_line, truncate
from orbit.timeutil import isoformat_z
from tests.conftest import SECRET_KEY


def test_tokens_are_long_unique_and_hashed_deterministically() -> None:
    first, second = new_token(), new_token()

    assert first != second
    assert len(first) >= 43
    assert hash_token(first) == hash_token(first)
    assert hash_token(first) != hash_token(second)
    assert len(hash_token(first)) == 64
    assert first not in hash_token(first)


def test_constant_time_equals_compares_values() -> None:
    assert constant_time_equals("abc", "abc")
    assert not constant_time_equals("abc", "abd")
    assert not constant_time_equals("abc", "abcd")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (" Alex@Example.COM ", "alex@example.com"),
        ("blake+tag@sub.example.org", "blake+tag@sub.example.org"),
    ],
)
def test_emails_are_normalised(raw: str, expected: str) -> None:
    assert normalize_email(raw) == expected


@pytest.mark.parametrize("bad", ["", "   ", "nope", "a@", "@b.com", "a b@c.com", "x@" + "y" * 400])
def test_bad_emails_are_rejected(bad: str) -> None:
    with pytest.raises(InvalidInput):
        normalize_email(bad)


@pytest.mark.parametrize(
    ("email", "name"),
    [
        ("alex.smith@example.com", "Alex Smith"),
        ("blake_jones+work@example.com", "Blake Jones Work"),
        ("x@example.com", "X"),
    ],
)
def test_display_names_come_from_the_email(email: str, name: str) -> None:
    assert display_name_from_email(email) == name


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, "/spaces"),
        ("", "/spaces"),
        ("/spaces/abc", "/spaces/abc"),
        ("/invite/xyz?x=1", "/invite/xyz?x=1"),
        ("//evil.example", "/spaces"),
        ("https://evil.example", "/spaces"),
        ("/\\evil.example", "/spaces"),
        ("javascript:alert(1)", "/spaces"),
        ("/ok\nnext", "/spaces"),
        ("relative/path", "/spaces"),
        ("/" + "a" * 3000, "/spaces"),
    ],
)
def test_next_paths_cannot_leave_the_site(raw: str | None, expected: str) -> None:
    assert safe_next_path(raw) == expected


def test_signed_values_round_trip_and_reject_tampering_and_other_purposes() -> None:
    signer = Signer(SECRET_KEY)
    token = signer.sign({"a": 1}, "consent")

    assert signer.unsign(token, "consent", 60) == {"a": 1}
    assert signer.unsign(token, "other", 60) is None
    assert signer.unsign(token + "x", "consent", 60) is None
    assert Signer("a-different-secret-a-different-secret-1").unsign(token, "consent", 60) is None


def test_signed_values_expire() -> None:
    signer = Signer(SECRET_KEY)
    token = signer.sign({"a": 1}, "consent")

    assert signer.unsign(token, "consent", -1) is None


def test_derived_client_secrets_are_stable_and_per_client() -> None:
    signer = Signer(SECRET_KEY)

    assert signer.derive_client_secret("client-a") == signer.derive_client_secret("client-a")
    assert signer.derive_client_secret("client-a") != signer.derive_client_secret("client-b")
    assert signer.derive_client_secret("client-a") != Signer(
        "a-different-secret-a-different-secret-1"
    ).derive_client_secret("client-a")


def test_single_line_text_is_collapsed_and_checked() -> None:
    assert clean_single_line("  a \n b\t c\x00 ", "Title", 10) == "a b c"
    with pytest.raises(InvalidInput):
        clean_single_line(" \n ", "Title", 10)
    with pytest.raises(TooLong):
        clean_single_line("x" * 11, "Title", 10)


def test_block_text_keeps_newlines_but_not_control_characters() -> None:
    assert clean_block("  one\r\ntwo\rthree\x07 ", "Content", 100) == "one\ntwo\nthree"
    with pytest.raises(InvalidInput):
        clean_block("\n\n", "Content", 10)
    with pytest.raises(TooLong):
        clean_block("x" * 11, "Content", 10)


def test_truncate_reports_whether_it_cut() -> None:
    assert truncate("short", 10) == ("short", False)
    assert truncate("abcdefghij", 5) == ("abcde", True)


def test_timestamps_are_rendered_in_utc() -> None:
    moment = datetime(2026, 11, 19, 12, 30, 5, tzinfo=timezone(timedelta(hours=5, minutes=30)))

    assert isoformat_z(moment) == "2026-11-19T07:00:05Z"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("203.0.113.9", "203.0.113.9"),
        ("2001:db8:abcd:12:1:2:3:4", "2001:db8:abcd:12::/64"),
        ("2001:db8:abcd:12:ffff:ffff:ffff:ffff", "2001:db8:abcd:12::/64"),
        ("::ffff:203.0.113.9", "203.0.113.9"),
        ("fe80::1%eth0", "fe80::/64"),
        ("testclient", "testclient"),
        ("unknown", "unknown"),
    ],
)
def test_addresses_are_grouped_for_rate_limits(raw: str, expected: str) -> None:
    assert rate_limit_address(raw) == expected
