from __future__ import annotations

import re
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
CHANGELOG = API_ROOT.parent / "CHANGELOG.md"
VERSIONS = API_ROOT / "alembic" / "versions"
REVISION = re.compile(r'^revision = "([^"]+)"', re.MULTILINE)


def revisions() -> list[str]:
    found = [
        REVISION.search(path.read_text(encoding="utf-8"))
        for path in sorted(VERSIONS.glob("[0-9]*.py"))
    ]
    return [match.group(1) for match in found if match is not None]


def test_the_revision_scan_finds_the_migrations() -> None:
    assert len(revisions()) == len(list(VERSIONS.glob("[0-9]*.py")))
    assert revisions()


def test_every_migration_is_named_in_the_changelog() -> None:
    if not CHANGELOG.exists():
        pytest.skip("CHANGELOG.md is not part of this checkout")
    text = CHANGELOG.read_text(encoding="utf-8")

    missing = [revision for revision in revisions() if f"migration `{revision}`" not in text]

    assert not missing, (
        f"CHANGELOG.md does not mention migration(s) {missing}. "
        "List each one under Migrations as: migration `NNNN`: what it changes."
    )
