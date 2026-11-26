# Releasing Orbit

Versions follow [Semantic Versioning](https://semver.org/). While Orbit is below 1.0, a minor version (`0.2.0`) may change settings or behaviour in ways that need action from people running their own copy, and a patch version (`0.1.1`) does not. From 1.0, anything that needs action waits for a major version.

A release is a tag. Pushing `vX.Y.Z` runs `.github/workflows/release.yml`, which publishes the images and creates the GitHub release. Nothing is published from a branch.

## Before you tag

1. Make sure `main` is green and holds everything the release should contain.
2. Choose the version. If any migration is destructive or a setting changed meaning, it is a minor version below 1.0 and a major version from 1.0.
3. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` above it. Check the entry honestly:
   - Every migration since the last release is listed under **Migrations** as ``migration `NNNN` ``, with what it changes and anything slow or one-way. A test (`api/tests/test_changelog_migrations.py`) fails when one is missing.
   - Every new, changed or removed setting is listed, with its default.
   - Anything people must do by hand when upgrading is stated plainly at the top of the entry.
4. Set the same version in `api/pyproject.toml`, `web/package.json` and the top of `web/package-lock.json`.
5. Open a pull request with these changes, and merge it once CI passes.

## Tag

```
git switch main
git pull
git tag -s vX.Y.Z -m "Orbit X.Y.Z"
git push origin vX.Y.Z
```

Use `git tag -a` if you do not sign tags. A pre-release uses a suffix such as `v0.2.0-rc.1`; its images get only their exact tag, and its GitHub release is marked as a pre-release.

## What the workflow does

1. **verify:** refuses the tag unless it is a semantic version, matches `api/pyproject.toml` and `web/package.json`, and has a `## [X.Y.Z]` heading in `CHANGELOG.md`.
2. **images:** builds `api` and `web` for amd64 and arm64 and pushes `ghcr.io/aionyx-technologies/orbit-api` and `ghcr.io/aionyx-technologies/orbit-web` with the tags `X.Y.Z`, `X.Y` and (from 1.0) `X`, plus `latest` for a stable release, with provenance and an SBOM attached.
3. **release:** creates the GitHub release, using that version's section of the changelog as its notes.

## After the first release

- In the GitHub package settings for both images, set the visibility to public so people can pull without signing in.
- Once a released image exists, consider changing the default of `ORBIT_PULL_POLICY` in `docker-compose.yml` from `build` to `always` and the default `ORBIT_VERSION` to a pinned number, so `docker compose up -d` downloads instead of building.

## If something goes wrong

- A failed **verify** needs a fix on `main` and a new tag. Delete the bad tag first: `git push origin :refs/tags/vX.Y.Z` and `git tag -d vX.Y.Z`.
- Do not move a tag that has published images. Publish a new patch version instead, because people may already have pulled the old one.
- A bad release is corrected by a new patch release. Say so in the changelog entry of the new one.
