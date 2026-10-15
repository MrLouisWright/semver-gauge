# Changelog

## 1.0.0 (2026-10-15)

- **Reuses commit-gauge's parser** (`commit-gauge/parser`, `^1.0.0`) instead of its own Conventional Commits regex; semver-gauge adds no lint rules.
- **Changesets support:** `.changeset/*.md` as an alternative source of truth (`--source auto|commits|changesets`, auto-detected). The highest changeset level for the package sets the required bump.
- **API-surface diff** (`--api <file.d.ts>`, `--api-base`): removed or changed exports require a major bump; a new `api-breaking-change` rule catches breaking changes labelled as `fix`/`feat`. `extractApi` / `diffApi` are exported.
- **Monorepo support** (`--workspaces`, `checkWorkspaces`): each workspace package is checked against its own `<name>@x.y.z` tag, the commits under its folder, root changesets naming it and its own CHANGELOG. Reads the workspace list only; hygiene checks stay in monorepo-gauge. New `changeset-unknown-package` rule.
- Dual ESM + CJS build, generated `.d.ts`, require/import CI checks.


First release, by Louis Wright.

- Required-bump calculation from Conventional Commits since the last release tag (or `--base`), including `!` and `BREAKING CHANGE:` footers and 0.x semantics.
- Rules: version-regressed, invalid-version, version-not-bumped, insufficient-bump, excessive-bump, version-skipped, prerelease-mismatch, tag-exists, changelog-missing, changelog-no-entry, changelog-empty-entry, changelog-not-latest, changelog-bad-date, unreleased-not-empty, non-conventional-commit.
- CHANGELOG parsing for Keep a Changelog and plain `## x.y.z` headings.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
