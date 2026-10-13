import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, valid, compare, diff, inc, parseCommit, commitLevel, parseChangelog } from '../src/index.js';

test('semver parse/valid', () => {
  assert.ok(valid('1.2.3')); assert.ok(valid('v1.2.3-rc.1+b5')); assert.ok(!valid('1.2')); assert.ok(!valid('01.2.3')); assert.ok(!valid(''));
  assert.deepEqual(parse('1.2.3-alpha.1').pre, ['alpha', '1']);
});
test('semver compare incl. prerelease precedence', () => {
  const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
  for (let i = 1; i < order.length; i++) assert.equal(compare(order[i - 1], order[i]), -1, `${order[i - 1]} < ${order[i]}`);
  assert.equal(compare('1.0.0+a', '1.0.0+b'), 0);
});
test('semver diff/inc', () => {
  assert.equal(diff('1.2.3', '2.0.0'), 'major'); assert.equal(diff('1.2.3', '1.3.0'), 'minor'); assert.equal(diff('1.2.3', '1.2.4'), 'patch');
  assert.equal(diff('1.2.3', '1.2.3'), 'none'); assert.equal(diff('1.2.3', '1.2.2'), 'downgrade'); assert.equal(diff('1.0.0-rc.1', '1.0.0-rc.2'), 'prerelease');
  assert.equal(inc('1.2.3', 'minor'), '1.3.0'); assert.equal(inc('1.2.3', 'major'), '2.0.0'); assert.equal(inc('1.2.3-rc.1', 'patch'), '1.2.3');
});
test('conventional commits', () => {
  const c = parseCommit('feat(api)!: drop node 16');
  assert.equal(c.type, 'feat'); assert.equal(c.scope, 'api'); assert.ok(c.breaking);
  assert.equal(commitLevel(c), 'major');
  assert.equal(commitLevel(parseCommit('fix: x\n\nBREAKING CHANGE: y')), 'major');
  assert.equal(commitLevel(parseCommit('feat: add x')), 'minor');
  assert.equal(commitLevel(parseCommit('fix: x')), 'patch');
  assert.equal(commitLevel(parseCommit('docs: x')), 'none');
  assert.equal(commitLevel(parseCommit('Fixed stuff')), 'unknown');
  assert.equal(commitLevel(parseCommit('Fixed stuff\n\nBREAKING CHANGE: z')), 'major');
  assert.equal(commitLevel(parseCommit('style: x'), { style: 'patch' }), 'patch');
});
test('changelog parsing styles', () => {
  const e = parseChangelog('# Changelog\n\n## [Unreleased]\n\n- wip\n\n## [1.1.0] - 2026-02-01\n### Added\n- x\n\n## 1.0.0 (2026-01-01)\n\nFirst\n\n```\n## 9.9.9 not a heading\n```\n\n[1.1.0]: https://x\n');
  assert.deepEqual(e.map((x) => x.version), [null, '1.1.0', '1.0.0']);
  assert.equal(e[1].date, '2026-02-01'); assert.match(e[1].text, /Added/); assert.match(e[2].text, /9\.9\.9/);
  assert.ok(e[0].unreleased);
  assert.deepEqual(parseChangelog('# v2.0.0\nx\n# v1.0.0\ny').map((x) => x.version), ['2.0.0', '1.0.0']);
});
