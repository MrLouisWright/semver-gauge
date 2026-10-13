# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Required-bump calculation from Conventional Commits since the last release tag (or `--base`), including `!` and `BREAKING CHANGE:` footers and 0.x semantics.
- Rules: version-regressed, invalid-version, version-not-bumped, insufficient-bump, excessive-bump, version-skipped, prerelease-mismatch, tag-exists, changelog-missing, changelog-no-entry, changelog-empty-entry, changelog-not-latest, changelog-bad-date, unreleased-not-empty, non-conventional-commit.
- CHANGELOG parsing for Keep a Changelog and plain `## x.y.z` headings.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
