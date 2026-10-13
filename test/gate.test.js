import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../src/index.js';
import { repo, commit, g, write, tmp, CL } from './helpers.js';

const now = new Date('2026-10-14T12:00:00Z');
const rules = (r) => r.findings.map((f) => f.rule).sort();
function released(v = '1.2.0', cl = CL([v, '- stuff'])) { const d = repo({ 'package.json': { name: 'p', version: v }, 'CHANGELOG.md': cl }); g(d, 'tag', `v${v}`); return d; }
function bump(d, v, entry = '- changes') { const pj = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')); pj.version = v; const cl = readFileSync(join(d, 'CHANGELOG.md'), 'utf8').replace('# Changelog\n\n', `# Changelog\n\n## ${v} (2026-10-14)\n\n${entry}\n\n`); commit(d, `chore(release): ${v}`, { 'package.json': pj, 'CHANGELOG.md': cl }); }

test('clean release: feat -> minor passes', () => {
  const d = released(); commit(d, 'feat: new thing'); commit(d, 'fix: bug'); bump(d, '1.3.0');
  const r = check(d, { now });
  assert.deepEqual(rules(r), []); assert.equal(r.info.required, 'minor'); assert.equal(r.info.baseVersion, '1.2.0'); assert.equal(r.info.commits, 2);
});
test('breaking change with minor bump -> insufficient-bump (high)', () => {
  const d = released(); commit(d, 'feat!: remove old api'); bump(d, '1.3.0');
  const r = check(d, { now });
  const f = r.findings.find((x) => x.rule === 'insufficient-bump');
  assert.equal(f.severity, 'high'); assert.match(f.fix, /2\.0\.0/);
});
test('BREAKING CHANGE footer counts', () => {
  const d = released(); commit(d, 'fix: x\n\nBREAKING CHANGE: changed return type'); bump(d, '1.2.1');
  assert.ok(rules(check(d, { now })).includes('insufficient-bump'));
});
test('feat with patch bump -> insufficient', () => {
  const d = released(); commit(d, 'feat: x'); bump(d, '1.2.1');
  assert.deepEqual(rules(check(d, { now })), ['insufficient-bump']);
});
test('fix with major bump -> excessive-bump (low)', () => {
  const d = released(); commit(d, 'fix: x'); bump(d, '2.0.0');
  const r = check(d, { now }); assert.deepEqual(rules(r), ['excessive-bump']); assert.equal(r.findings[0].severity, 'low');
});
test('skipped versions', () => {
  const d = released(); commit(d, 'feat: x'); bump(d, '1.5.0');
  assert.deepEqual(rules(check(d, { now })), ['version-skipped']);
});
test('version regressed (critical)', () => {
  const d = released(); commit(d, 'fix: x'); bump(d, '1.1.9');
  const r = check(d, { now }); assert.ok(r.findings.some((f) => f.rule === 'version-regressed' && f.severity === 'critical'));
});
test('not bumped: pending-release info by default, version-not-bumped with requireBump', () => {
  const d = released(); commit(d, 'feat: x');
  const r = check(d, { now }); assert.deepEqual(rules(r), ['pending-release']); assert.equal(r.info.expected, '1.3.0');
  assert.deepEqual(rules(check(d, { now, requireBump: true })), ['version-not-bumped']);
  const d2 = released(); commit(d2, 'docs: readme');
  assert.deepEqual(rules(check(d2, { now, requireBump: true })), []);
});
test('0.x semantics: breaking -> minor, feat -> patch', () => {
  const d = released('0.3.0'); commit(d, 'feat!: x'); bump(d, '0.4.0');
  assert.deepEqual(rules(check(d, { now })), []);
  const d2 = released('0.3.0'); commit(d2, 'feat!: x'); bump(d2, '0.3.1');
  assert.deepEqual(rules(check(d2, { now })), ['insufficient-bump']);
  const d3 = released('0.3.0'); commit(d3, 'feat: x'); bump(d3, '0.3.1');
  assert.deepEqual(rules(check(d3, { now })), []);
  const d4 = released('0.9.0'); commit(d4, 'feat: x'); bump(d4, '1.0.0');
  assert.deepEqual(rules(check(d4, { now })), [], '1.0.0 graduation is not excessive');
});
test('prereleases', () => {
  const d = released('2.0.0-rc.1'); commit(d, 'feat!: x'); bump(d, '2.0.0-rc.2');
  assert.deepEqual(rules(check(d, { now })), []);
  const d2 = released('2.0.0-rc.2'); commit(d2, 'fix: x'); bump(d2, '2.0.0');
  assert.deepEqual(rules(check(d2, { now })), []);
});
test('non-conventional commits are info; --unknown-as', () => {
  const d = released(); commit(d, 'Updated things'); bump(d, '1.2.1');
  const r = check(d, { now }); assert.deepEqual(rules(r), ['non-conventional-commit']); assert.equal(r.findings[0].severity, 'info');
  const d2 = released(); commit(d2, 'Updated things'); bump(d2, '1.2.1');
  assert.ok(rules(check(d2, { now, unknownAs: 'minor' })).includes('insufficient-bump'));
});
test('merge and release commits ignored', () => {
  const d = released(); commit(d, 'Merge branch \'x\''); commit(d, 'v1.2.0');
  assert.deepEqual(rules(check(d, { now })), []);
});
test('tag-exists', () => {
  const d = released(); commit(d, 'fix: x'); bump(d, '1.2.1'); g(d, 'tag', 'v1.2.1', 'HEAD~1');
  assert.ok(rules(check(d, { now, base: 'v1.2.0' })).includes('tag-exists'));
  assert.ok(!rules(check(d, { now, base: 'v1.2.0', checkTag: false })).includes('tag-exists'));
});
test('explicit --base ref and unknown ref', () => {
  const d = released(); commit(d, 'feat: a'); g(d, 'tag', 'base-x'); commit(d, 'fix: b'); bump(d, '1.2.1');
  const r = check(d, { now, base: 'base-x' }); assert.equal(r.info.baseVersion, '1.2.0'); assert.deepEqual(rules(r), []);
  assert.throws(() => check(d, { now, base: 'nope' }), /Unknown git ref/);
});
test('commits from a list, no git', () => {
  const d = write(tmp(), { 'package.json': { version: '1.1.0' }, 'CHANGELOG.md': CL(['1.1.0', '- x']) });
  const r = check(d, { now, baseVersion: '1.0.0', commits: [{ message: 'feat!: x' }] });
  assert.deepEqual(rules(r), ['insufficient-bump']);
});
test('changelog: missing, no entry, empty, not latest, future date, unreleased leftovers', () => {
  const d = write(tmp(), { 'package.json': { version: '1.0.0' } });
  assert.deepEqual(rules(check(d, { now })), ['changelog-missing']);
  write(d, { 'CHANGELOG.md': CL(['0.9.0', '- x']) });
  assert.deepEqual(rules(check(d, { now })), ['changelog-no-entry']);
  write(d, { 'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\n## 0.9.0\n- x\n' });
  assert.deepEqual(rules(check(d, { now })), ['changelog-empty-entry']);
  write(d, { 'CHANGELOG.md': CL(['1.1.0', '- y'], ['1.0.0', '- x']) });
  assert.deepEqual(rules(check(d, { now })), ['changelog-not-latest']);
  write(d, { 'CHANGELOG.md': CL(['0.9.0', '- y'], ['1.0.0', '- x']) });
  assert.deepEqual(rules(check(d, { now })), ['changelog-not-latest']);
  write(d, { 'CHANGELOG.md': CL(['1.0.0', '- x', '2027-05-01']) });
  assert.deepEqual(rules(check(d, { now })), ['changelog-bad-date']);
  write(d, { 'CHANGELOG.md': CL(['1.0.0', '- x', '2026-02-30']) });
  assert.deepEqual(rules(check(d, { now })), ['changelog-bad-date']);
  write(d, { 'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n- leftover\n\n## [1.0.0] - 2026-10-01\n\n- x\n' });
  assert.deepEqual(rules(check(d, { now, baseVersion: '0.9.0', commits: [{ message: 'fix: a' }] })), ['unreleased-not-empty']);
});
test('prerelease-mismatch between changelog and package', () => {
  const d = write(tmp(), { 'package.json': { version: '2.0.0-rc.1' }, 'CHANGELOG.md': CL(['2.0.0', '- x']) });
  assert.deepEqual(rules(check(d, { now })), ['changelog-no-entry', 'prerelease-mismatch']);
});
test('invalid version', () => {
  const d = write(tmp(), { 'package.json': { version: '1.0' } });
  assert.deepEqual(rules(check(d, { now })), ['invalid-version']);
});
test('allowlist suppresses with expiry', () => {
  const d = released(); commit(d, 'fix: x'); bump(d, '2.0.0');
  const ok = check(d, { now }, { allowlist: [{ rule: 'excessive-bump', reason: 'marketing major', expires: '2027-01-01' }] });
  assert.deepEqual(rules(ok), []); assert.equal(ok.suppressed.length, 1);
  const old = check(d, { now }, { allowlist: [{ rule: 'excessive-bump', reason: 'x', expires: '2026-01-01' }] });
  assert.deepEqual(rules(old), ['allowlist-expired', 'excessive-bump']);
});
test('custom commit types from config', () => {
  const d = released(); commit(d, 'deps: bump lodash'); bump(d, '1.2.1');
  assert.deepEqual(rules(check(d, { now }, { types: { deps: 'patch' } })), []);
});
