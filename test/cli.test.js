import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, commit, g, run, tmp, write, CL } from './helpers.js';

function scenario() { const d = repo({ 'package.json': { name: 'p', version: '1.0.0' }, 'CHANGELOG.md': CL(['1.0.0', '- x']) }); g(d, 'tag', 'v1.0.0'); commit(d, 'feat!: break'); const pj = { name: 'p', version: '1.1.0' }; commit(d, 'chore(release): 1.1.0', { 'package.json': pj, 'CHANGELOG.md': CL(['1.1.0', '- y'], ['1.0.0', '- x']) }); return d; }

test('exit 1 on high finding, 0 with --fail-on critical', () => {
  const d = scenario();
  const r = run([d]); assert.equal(r.code, 1); assert.match(r.out, /insufficient-bump/); assert.match(r.out, /fix: Bump to 2\.0\.0/);
  assert.equal(run([d, '--fail-on', 'critical']).code, 0);
  assert.equal(run([d, '--fail-on', 'none']).code, 0);
});
test('formats and output files', () => {
  const d = scenario(); const o = tmp();
  const r = run([d, '--json', join(o, 'r.json'), '--sarif', join(o, 'r.sarif'), '--markdown', join(o, 'r.md')]);
  assert.equal(r.code, 1);
  const j = JSON.parse(readFileSync(join(o, 'r.json'), 'utf8')); assert.equal(j.info.required, 'major'); assert.equal(j.counts.high, 1);
  const s = JSON.parse(readFileSync(join(o, 'r.sarif'), 'utf8')); assert.equal(s.runs[0].results[0].ruleId, 'insufficient-bump');
  assert.match(readFileSync(join(o, 'r.md'), 'utf8'), /\| high \|/);
  assert.equal(JSON.parse(run([d, '-f', 'json']).out).findings.length, 1);
  assert.match(run([d, '-f', 'markdown']).out, /semver-gauge/);
  assert.equal(JSON.parse(run([d, '-f', 'sarif']).out).version, '2.1.0');
});
test('config file allowlist and package.json key', () => {
  const d = scenario();
  writeFileSync(join(d, '.semver-gauge.json'), JSON.stringify({ allowlist: [{ rule: 'insufficient-bump', reason: 'deliberate', expires: '2099-01-01' }] }));
  assert.equal(run([d]).code, 0);
  writeFileSync(join(d, '.semver-gauge.json'), JSON.stringify({ allowlist: [{ rule: 'insufficient-bump' }] }));
  assert.equal(run([d]).code, 2, 'reason required');
  const e = write(tmp(), { 'package.json': { version: '1.0.0', semverGauge: { changelog: 'HISTORY.md' } }, 'HISTORY.md': CL(['1.0.0', '- x']) });
  assert.equal(run([e]).code, 0);
});
test('--commits file, --base-version, --require-bump, --changelog-only', () => {
  const d = write(tmp(), { 'package.json': { version: '1.0.0' }, 'CHANGELOG.md': CL(['1.0.0', '- x']), 'c.txt': 'feat: a\n---\nfix: b\n' });
  const r = run([d, '--commits', join(d, 'c.txt'), '--base-version', '1.0.0', '--require-bump']);
  assert.equal(r.code, 1); assert.match(r.out, /version-not-bumped/);
  assert.equal(run([d, '--commits', join(d, 'c.txt'), '--base-version', '1.0.0']).code, 0);
  assert.equal(run([d, '--changelog-only', '--fail-on', 'info']).code, 0);
  assert.equal(run([d, '--no-changelog', '--version-override', '2.0.0', '--fail-on', 'info']).code, 0);
});
test('usage errors exit 2', () => {
  assert.equal(run(['--nope']).code, 2);
  assert.equal(run([tmp()]).code, 2, 'no package.json');
  assert.equal(run([tmp(), '--unknown-as', 'huge']).code, 2);
  const d = scenario(); assert.equal(run([d, '--base', 'does-not-exist']).code, 2);
});
test('--help, --version, --list-rules', () => {
  assert.match(run(['--help']).out, /Exit codes/);
  assert.match(run(['--version']).out, /^\d+\.\d+\.\d+/);
  assert.match(run(['--list-rules']).out, /insufficient-bump/);
});
