## What this changes

One or two sentences. Link the issue if there is one.

## How it was checked

- [ ] `ruff check`, `ruff format --check` and `mypy` pass in `api/`
- [ ] `pytest` passes in `api/`
- [ ] `npm run lint`, `typecheck`, `format:check`, `test` and `build` pass in `web/`
- [ ] New behaviour has tests, and a test fails without the change
- [ ] Every commit is signed off (`git commit -s`), see the Developer Certificate of Origin in CONTRIBUTING.md

## Safety checks

- [ ] Every read and write still checks space membership in the service layer
- [ ] Nothing a member shared appears in logs, errors or emails
- [ ] No secrets, personal emails or real space data are included
- [ ] Existing environment variables keep their meaning, or the change is noted in CHANGELOG.md

## Not verified

Anything you could not try, for example a real assistant connection or a real mail server.
