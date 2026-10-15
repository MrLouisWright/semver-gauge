import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, valid, compare, diff, inc, LEVELS } from './semver.js';
import { parseCommit, commitLevel, isMergeOrRelease, DEFAULT_TYPES } from './commits.js';
import { parseChangelog } from './changelog.js';
import * as G from './git.js';
import { buildReport, UsageError } from './core.js';
import { readChangesets, changesetLevel, parseChangeset } from './changesets.js';
import { extractApi, diffApi } from './api.js';
import { listWorkspaces } from './workspaces.js';
export { readChangesets, changesetLevel, parseChangeset, extractApi, diffApi, listWorkspaces };

export { parse, valid, compare, diff, inc, parseCommit, commitLevel, parseChangelog };
export * from './core.js';

export const RULES = {
  'version-regressed': { severity: 'critical', title: 'Version is lower than the last release' },
  'invalid-version': { severity: 'high', title: 'package.json version is not valid SemVer' },
  'insufficient-bump': { severity: 'high', title: 'Version bump is smaller than the changes require' },
  'version-not-bumped': { severity: 'high', title: 'Releasable changes but the version was not bumped (--require-bump)' },
  'tag-exists': { severity: 'high', title: 'A git tag for this version already exists' },
  'changelog-missing': { severity: 'high', title: 'No CHANGELOG file' },
  'changelog-no-entry': { severity: 'high', title: 'CHANGELOG has no entry for the current version' },
  'changelog-empty-entry': { severity: 'medium', title: 'CHANGELOG entry for the current version is empty' },
  'version-skipped': { severity: 'medium', title: 'Version jumps over intermediate versions' },
  'changelog-not-latest': { severity: 'medium', title: 'Current version is not the newest CHANGELOG entry' },
  'changelog-bad-date': { severity: 'low', title: 'CHANGELOG entry date is invalid or in the future' },
  'unreleased-not-empty': { severity: 'low', title: 'Unreleased section still has content after a version bump' },
  'excessive-bump': { severity: 'low', title: 'Version bump is larger than the changes require' },
  'prerelease-mismatch': { severity: 'low', title: 'Pre-release version where the changelog or tag expects a release (or vice versa)' },
  'api-breaking-change': { severity: 'high', title: 'Public API (.d.ts) has removed or changed exports, but the changes are not marked as breaking' },
  'changeset-unknown-package': { severity: 'medium', title: 'A changeset names a package that is not in this repository' },
  'non-conventional-commit': { severity: 'info', title: 'Commit message is not a Conventional Commit, so its impact is unknown' },
  'pending-release': { severity: 'info', title: 'Unreleased changes are waiting for a version bump' },
};

const rank = (l) => LEVELS.indexOf(l);
const short = (s) => (s ? s.slice(0, 7) : '');

/** Read a commits file: messages separated by a line containing only "---". */
export function readCommitsFile(file) {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split(/^---$/m).map((s) => s.trim()).filter(Boolean).map((message) => ({ sha: null, message }));
}

/**
 * Analyse a package directory.
 * opts: { base, baseVersion, version, commits: [{sha,message}], changelog, changelogOnly, requireBump, types, now }
 */
export function analyze(dir, opts = {}) {
  const now = opts.now || new Date();
  const findings = [];
  const add = (rule, message, fix, extra = {}) => findings.push({ rule, severity: RULES[rule].severity, message, fix, ...extra });
  let pkg = {};
  const pkgPath = join(dir, 'package.json');
  if (opts.version == null) {
    if (!existsSync(pkgPath)) throw new UsageError(`No package.json in ${dir} (or pass --version)`);
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch (e) { throw new UsageError(`Cannot parse package.json: ${e.message}`); }
  }
  const version = String(opts.version ?? pkg.version ?? '');
  const info = { version, baseRef: null, baseVersion: null, required: 'none', actual: null, expected: null, commits: 0 };
  if (!valid(version)) { add('invalid-version', `version "${version}" is not valid SemVer`, 'Use MAJOR.MINOR.PATCH, e.g. "1.0.0".', { file: 'package.json' }); return { info, findings }; }
  const cur = parse(version);
  const types = { ...DEFAULT_TYPES, ...(opts.types || {}) };

  // ---- version vs changes ----
  if (!opts.changelogOnly) {
    const inGit = G.isRepo(dir);
    let baseVersion = opts.baseVersion ?? null; let baseRef = opts.base || null;
    if (!baseRef && !opts.commits && inGit && opts.base !== false) baseRef = G.latestTag(dir, opts.tagMatch);
    if (baseRef && !baseVersion) {
      if (valid(baseRef.replace(/^.*@/, ''))) baseVersion = parse(baseRef.replace(/^.*@/, '')).raw;
      else if (inGit) { const pj = G.showFile(dir, baseRef, 'package.json'); try { baseVersion = pj ? JSON.parse(pj).version : null; } catch { baseVersion = null; } }
      if (inGit && G.tryGit(dir, ['rev-parse', '-q', '--verify', `${baseRef}^{commit}`]) === null) throw new UsageError(`Unknown git ref: ${baseRef}`);
    }
    info.baseRef = baseRef; info.baseVersion = baseVersion;
    let commits = opts.commits || (inGit && baseRef ? G.commitsSince(dir, baseRef) : []);
    commits = commits.map((c) => ({ ...c, parsed: parseCommit(c.message) })).filter((c) => !isMergeOrRelease(c.parsed));
    info.commits = commits.length;
    let required = 'none'; let unknown = 0;
    // Changesets as the source of truth (auto: when .changeset/ has entries for this package)
    const changesets = opts.source === 'commits' ? null : readChangesets(opts.changesetsRoot || dir);
    if (opts.source === 'changesets' && !changesets) throw new UsageError(`No .changeset directory in ${opts.changesetsRoot || dir}`);
    const pkgName = opts.packageName || pkg.name;
    const cs = changesets ? changesetLevel(changesets, pkgName) : { level: 'none', files: [] };
    const useChangesets = opts.source === 'changesets' || (changesets && changesets.length > 0 && opts.source !== 'commits');
    info.source = useChangesets ? 'changesets' : 'commits';
    if (useChangesets) { required = cs.level; info.changesets = cs.files; commits = []; info.commits = 0; }
    for (const c of commits) {
      const lvl = commitLevel(c.parsed, types);
      if (lvl === 'unknown') { unknown++; add('non-conventional-commit', `${c.sha ? short(c.sha) + ' ' : ''}"${c.parsed.header.slice(0, 72)}" is not a Conventional Commit`, 'Use "type(scope): subject" (feat, fix, perf, docs, chore, …) and "!" or a BREAKING CHANGE: footer for breaking changes.', { subject: c.sha || c.parsed.header }); continue; }
      if (rank(lvl) > rank(required)) required = lvl;
    }
    if (unknown && required === 'none' && opts.unknownAs) required = opts.unknownAs;
    // API-surface diff of a .d.ts against the last release
    if (opts.api && baseRef && inGit) {
      const beforeText = opts.apiBase != null ? opts.apiBase : G.showFile(dir, baseRef, opts.api);
      const afterPath = join(dir, opts.api);
      if (beforeText != null && existsSync(afterPath)) {
        const d = diffApi(beforeText, readFileSync(afterPath, 'utf8'));
        info.api = d;
        if (d.level === 'major' && required !== 'major') add('api-breaking-change', `${opts.api}: ${[...d.removed.map((n) => `removed ${n}`), ...d.changed.map((n) => `changed ${n}`)].slice(0, 5).join(', ')} since ${baseRef}, but no commit/changeset is marked breaking`, 'Mark the change as breaking ("feat!:" or a BREAKING CHANGE: footer / a major changeset) and bump the major version, or restore the old signature.', { file: opts.api });
        if (rank(d.level) > rank(required)) required = d.level;
      }
    }
    if (baseVersion && valid(baseVersion)) {
      const base = parse(baseVersion);
      // 0.x: breaking -> minor, everything else -> patch
      let need = required;
      if (base.major === 0 && cur.major === 0) need = required === 'major' ? 'minor' : required === 'minor' ? 'patch' : required;
      info.required = need;
      const d = diff(baseVersion, version);
      const fromPre = base.pre.length > 0;
      let actual = d;
      if (d === 'prerelease' || (fromPre && d !== 'downgrade' && d !== 'none' && `${cur.major}.${cur.minor}.${cur.patch}` === `${base.major}.${base.minor}.${base.patch}`)) actual = 'satisfied';
      info.actual = actual;
      const label = `${baseVersion} → ${version}`;
      const why = (lvl) => commits.filter((c) => { const l = commitLevel(c.parsed, types); return l === lvl || (base.major === 0 && ((lvl === 'minor' && l === 'major') || (lvl === 'patch' && l === 'minor'))); }).slice(0, 3).map((c) => `"${c.parsed.header.slice(0, 60)}"`).join(', ');
      if (d === 'downgrade') add('version-regressed', `version went backwards: ${label}`, `Restore a version greater than ${baseVersion}.`, { file: 'package.json' });
      else if (d === 'none') {
        if (need !== 'none') {
          info.expected = inc(baseVersion, need);
          if (opts.requireBump) add('version-not-bumped', `${commits.length} change(s) since ${baseRef || baseVersion} need a ${need} release but the version is still ${version} (e.g. ${why(need)})`, `Bump to ${info.expected} and add a CHANGELOG entry.`, { file: 'package.json' });
          else add('pending-release', `unreleased ${need}-level changes since ${baseRef || baseVersion}; the next version should be ${info.expected}`, `When releasing, bump to ${info.expected}.`, { file: 'package.json' });
        }
      } else if (actual !== 'satisfied') {
        const exp = need === 'none' ? inc(baseVersion, 'patch') : inc(baseVersion, need);
        info.expected = exp;
        if (rank(actual) < rank(need)) add('insufficient-bump', `${label} is a ${actual} bump but the changes need ${need} (e.g. ${why(need)})`, `Bump to ${exp}, or if nothing is actually ${need === 'major' ? 'breaking' : 'a new feature'}, fix the commit type.`, { file: 'package.json' });
        else if (rank(actual) > rank(need) && need !== 'none' && !(base.major === 0 && cur.major >= 1)) add('excessive-bump', `${label} is a ${actual} bump but the changes only need ${need}`, `${exp} would be enough; ignore if the larger bump is deliberate (e.g. 1.0.0 graduation).`, { file: 'package.json' });
        const next = inc(baseVersion, actual);
        const core = `${cur.major}.${cur.minor}.${cur.patch}`;
        if (compare(core, next) > 0 && !(base.major === 0 && cur.major === 1 && cur.minor === 0 && cur.patch === 0)) add('version-skipped', `${label} skips versions (the next ${actual} release is ${next})`, `Use ${next} unless versions were intentionally skipped.`, { file: 'package.json' });
      }
      if (d !== 'none' && opts.checkTag !== false && G.isRepo(dir)) for (const t of [`v${version}`, version]) if (G.tagExists(dir, t)) { add('tag-exists', `git tag ${t} already exists, so ${version} has already been released`, `Bump to a new version (e.g. ${inc(version, need === 'none' ? 'patch' : need)}).`, { file: 'package.json' }); break; }
    }
  }

  // ---- changelog ----
  const clRel = opts.changelog || ['CHANGELOG.md', 'CHANGELOG', 'HISTORY.md', 'CHANGES.md', 'changelog.md'].find((f) => existsSync(join(dir, f))) || 'CHANGELOG.md';
  const clPath = join(dir, clRel);
  info.changelog = clRel;
  if (opts.changelog !== false) {
    if (!existsSync(clPath)) add('changelog-missing', `${clRel} not found`, `Create ${clRel} with a "## ${version} (${now.toISOString().slice(0, 10)})" entry describing the changes.`, { file: clRel });
    else {
      const entries = parseChangelog(readFileSync(clPath, 'utf8'));
      const versions = entries.filter((e) => e.version);
      const entry = versions.find((e) => valid(e.version) && compare(e.version, version) === 0);
      if (!entry) {
        const alt = versions.find((e) => e.version && parse(e.version) && `${parse(e.version).major}.${parse(e.version).minor}.${parse(e.version).patch}` === `${cur.major}.${cur.minor}.${cur.patch}`);
        if (alt && alt.version !== version) add('prerelease-mismatch', `${clRel} has ${alt.version} but package.json is ${version}`, 'Make the changelog heading match the package version exactly.', { file: clRel, line: alt.line });
        add('changelog-no-entry', `${clRel} has no entry for ${version}${versions[0] ? ` (newest is ${versions[0].version})` : ''}`, `Add "## ${version} (${now.toISOString().slice(0, 10)})" with the user-facing changes${entries.find((e) => e.unreleased && e.text) ? ', or rename the Unreleased section' : ''}.`, { file: clRel, line: versions[0]?.line });
      } else {
        if (!entry.text) add('changelog-empty-entry', `${clRel} entry for ${version} has no content`, 'Describe what changed (Added / Changed / Fixed / Removed).', { file: clRel, line: entry.line });
        const newest = versions.filter((e) => valid(e.version)).sort((a, b) => compare(b.version, a.version))[0];
        if (newest && compare(newest.version, version) > 0) add('changelog-not-latest', `${clRel} lists ${newest.version}, newer than the package version ${version}`, `Bump package.json to ${newest.version} or fix the heading.`, { file: clRel, line: newest.line });
        else if (versions[0] !== entry) add('changelog-not-latest', `${version} is not the first entry in ${clRel} (first is ${versions[0].version})`, 'Keep entries newest first.', { file: clRel, line: entry.line });
        if (entry.date) {
          const t = Date.parse(entry.date + 'T00:00:00Z');
          if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== entry.date) add('changelog-bad-date', `${clRel} entry for ${version} has an invalid date ${entry.date}`, 'Use YYYY-MM-DD.', { file: clRel, line: entry.line });
          else if (t > now.getTime() + 36 * 3600e3) add('changelog-bad-date', `${clRel} entry for ${version} is dated in the future (${entry.date})`, 'Use the actual release date.', { file: clRel, line: entry.line });
        }
      }
      const un = entries.find((e) => e.unreleased);
      if (un && un.text && info.baseVersion && valid(info.baseVersion) && compare(version, info.baseVersion) > 0) add('unreleased-not-empty', `${clRel} still has content under "${un.title}" after bumping to ${version}`, `Move it under the ${version} heading.`, { file: clRel, line: un.line });
    }
  }
  return { info, findings };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const { info, findings } = analyze(dir, { types: config.types, requireBump: config.requireBump, ...opts });
  const tool = { name: 'semver-gauge', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🏷️', defaultFile: 'package.json' };
  const line = info.baseVersion ? `${info.baseVersion} → ${info.version} (${info.commits} commit(s) since ${info.baseRef || 'base'}; changes need: ${info.required}${info.expected ? `, expected ${info.expected}` : ''})` : `version ${info.version}${opts.changelogOnly ? ' (changelog only)' : ' (no previous release found)'}`;
  return buildReport(tool, info.version ? `version ${info.version}` : 'package', findings, config, { now: opts.now, configFile, summaryLine: line, info });
}

/**
 * Check every workspace package separately: its own tag (<name>@x.y.z), the commits touching its
 * folder, root-level changesets naming it, and its own CHANGELOG. Hygiene checks are monorepo-gauge's job.
 * @param {string} root
 * @param {object} [opts]  same as check(), plus includePrivate
 * @param {object} [config]
 */
export function checkWorkspaces(root, opts = {}, config = {}, configFile) {
  const wss = listWorkspaces(root).filter((w) => opts.includePrivate || !w.private);
  if (!wss.length) throw new UsageError(`No workspace packages found in ${root} (package.json "workspaces" or pnpm-workspace.yaml)`);
  const findings = []; const packages = [];
  const names = new Set(wss.map((w) => w.name));
  for (const w of wss) {
    const esc = w.name;
    const { info, findings: f } = analyze(w.dir, { types: config.types, requireBump: config.requireBump, ...opts, changesetsRoot: root, packageName: w.name, tagMatch: [`${esc}@[0-9]*`, `${esc}@v[0-9]*`], base: opts.base ?? (G.latestTag(w.dir, [`${esc}@[0-9]*`, `${esc}@v[0-9]*`]) || false) });
    packages.push({ name: w.name, path: w.path, ...info });
    for (const x of f) findings.push({ ...x, message: `${w.name}: ${x.message}`, file: x.file ? `${w.path}/${x.file}` : w.path });
  }
  if (opts.source !== 'commits') {
    for (const c of readChangesets(root) || []) for (const n of Object.keys(c.releases)) if (!names.has(n)) findings.push({ rule: 'changeset-unknown-package', severity: RULES['changeset-unknown-package'].severity, message: `${c.file} bumps "${n}", which is not a workspace package`, fix: 'Fix the package name in the changeset front matter.', file: c.file });
  }
  const tool = { name: 'semver-gauge', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🏷️', defaultFile: 'package.json' };
  const line = packages.map((p) => `${p.name} ${p.baseVersion ? `${p.baseVersion} → ` : ''}${p.version} (needs ${p.required})`).join('; ');
  return buildReport(tool, `${packages.length} workspace package(s)`, findings, config, { now: opts.now, configFile, summaryLine: line, packages });
}
