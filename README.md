# semver-gauge

> A CI gate that checks your version bump matches what changed, and that the CHANGELOG has a real entry for it.

`semver-gauge` looks at the commits since your last release tag, works out the bump they need from [Conventional Commits](https://www.conventionalcommits.org/) (`feat` → minor, `fix`/`perf` → patch, `!` or a `BREAKING CHANGE:` footer → major) and compares that with the version in `package.json`. A breaking change shipped as a minor, a version that went backwards, a skipped version or a tag that already exists is reported with a severity and a **concrete fix** ("Bump to 2.0.0"). It also checks that `CHANGELOG.md` has a non-empty, correctly dated entry for the version, at the top.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. By Louis Wright.

## Features

- **Bump check:** the required level (major/minor/patch/none) comes from every commit since the last `v*` tag (or `--base <ref>`) that touches the package directory, so it works per-package in monorepos. Merge commits and release commits are ignored.
- **SemVer rules done properly:** pre-release precedence (`1.0.0-rc.1` → `1.0.0-rc.2` → `1.0.0`), **0.x semantics** (breaking → minor, feature → patch) and the 0.x → 1.0.0 graduation.
- **CHANGELOG check:** Keep a Changelog (`## [1.2.0] - 2026-01-01`), `## 1.2.0 (2026-01-01)` and `# v1.2.0` headings; empty entries, out-of-order entries, future or impossible dates, and a forgotten `[Unreleased]` section.
- **No git needed:** `--commits <file>` and `--base-version` let you feed it commit messages from anywhere.
- **Output:** text, JSON, SARIF 2.1.0 and Markdown; `--fail-on`; exit codes 0/1/2; allowlist entries with expiry dates.

## Rules

| Rule | Default severity | What it catches |
|---|---|---|
| `version-regressed` | critical | Version is lower than the last release |
| `invalid-version` | high | package.json version is not valid SemVer |
| `insufficient-bump` | high | Version bump is smaller than the changes require |
| `version-not-bumped` | high | Releasable changes but the version was not bumped (--require-bump) |
| `tag-exists` | high | A git tag for this version already exists |
| `changelog-missing` | high | No CHANGELOG file |
| `changelog-no-entry` | high | CHANGELOG has no entry for the current version |
| `changelog-empty-entry` | medium | CHANGELOG entry for the current version is empty |
| `version-skipped` | medium | Version jumps over intermediate versions |
| `changelog-not-latest` | medium | Current version is not the newest CHANGELOG entry |
| `changelog-bad-date` | low | CHANGELOG entry date is invalid or in the future |
| `unreleased-not-empty` | low | Unreleased section still has content after a version bump |
| `excessive-bump` | low | Version bump is larger than the changes require |
| `prerelease-mismatch` | low | Pre-release version where the changelog or tag expects a release (or vice versa) |
| `non-conventional-commit` | info | Commit message is not a Conventional Commit, so its impact is unknown |
| `pending-release` | info | Unreleased changes are waiting for a version bump |
| `allowlist-expired` | medium | Allowlist entry has expired |
| `allowlist-unused` | info | Allowlist entry matched nothing |

Between releases the version normally lags behind the commits, so un-bumped releasable changes are reported as `pending-release` (info, with the version you should release next). Add `--require-bump` (or `"requireBump": true`) on release branches to make that a `version-not-bumped` failure.

## Install and run

```bash
npx semver-gauge                          # check package.json against the latest v* tag and CHANGELOG.md
npx semver-gauge --base origin/main       # compare with another ref
npx semver-gauge --require-bump           # release PRs: releasable commits must come with a bump
npx semver-gauge --changelog-only         # just check CHANGELOG.md has an entry for the current version
npx semver-gauge -f sarif > semver.sarif
```

### Sample output

```text
semver-gauge — version 1.3.0
1.2.0 → 1.3.0 (2 commit(s) since v1.2.0; changes need: major, expected 2.0.0)

HIGH     package.json 1.2.0 → 1.3.0 is a minor bump but the changes need major (e.g. "feat!: remove the legacy export") [insufficient-bump]
         ↳ fix: Bump to 2.0.0, or if nothing is actually breaking, fix the commit type.

1 high
✖ Failing (fail-on: high).
```

## Options

```text
semver-gauge 1.0.0 — check the version bump matches the changes and the CHANGELOG has an entry

Usage: semver-gauge [dir] [options]

Version
      --base <ref>          Git ref of the last release (default: latest v* tag reachable from HEAD)
      --base-version <v>    Last released version (default: from the tag name or package.json at --base)
      --version-override <v> Check this version instead of package.json "version"
      --commits <file>      Read commit messages from a file (separated by lines of "---") instead of git
      --require-bump        Fail (version-not-bumped) when releasable commits exist but the version is unchanged
      --unknown-as <level>  Treat non-conventional commits as patch | minor | major (default: ignore)
      --no-tag-check        Don't check whether a git tag for the version already exists
Changelog
      --changelog <file>    Changelog path (default: CHANGELOG.md, HISTORY.md, CHANGES.md)
      --changelog-only      Only check the changelog entry, not the bump
      --no-changelog        Skip changelog checks

Common
  -c, --config <file>     JSON config (default: .semver-gauge.json or "semverGauge" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

Custom commit types can be mapped in config: `"types": { "deps": "patch", "security": "patch" }`.

## Configuration and allowlist

Options can live in `.semver-gauge.json` (or a `"semverGauge"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": { "non-conventional-commit": "low" },
  "allowlist": [
    { "rule": "excessive-bump", "match": "1.9.0 → 3.0.0", "reason": "Deliberate major for the v3 rebrand", "expires": "2027-03-31" }
  ],
  "requireBump": true,
  "types": { "deps": "patch" }
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  semver-gauge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false, fetch-depth: 0 }
      - uses: MrLouisWright/semver-gauge@v1
        with:
          fail-on: high
          sarif: semver-gauge.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: semver-gauge.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Project directory | `.` |
| `base` | Git ref of the last release (default: latest v* tag) | `` |
| `changelog` | Changelog path (default: CHANGELOG.md) | `` |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

The checkout needs `fetch-depth: 0` so the tags and history are available.

## Library

```js
import { check, formatText } from 'semver-gauge';
const report = check('.', { base: 'v1.2.0' });
console.log(formatText(report, { failOn: 'high' }));
```

`parse`, `compare`, `diff`, `inc`, `parseCommit`, `commitLevel` and `parseChangelog` are exported too. Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
