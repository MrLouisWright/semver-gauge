import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, checkWorkspaces, parseChangeset, readChangesets, extractApi, diffApi, listWorkspaces, parseCommit } from '../src/index.js';
import { parseCommit as cgParse } from 'commit-gauge/parser';
import { repo, commit, g, write, tmp, run, CL } from './helpers.js';

const now = new Date('2026-10-14T12:00:00Z');
const rules = (r) => r.findings.map((f) => f.rule).sort();

test('commit parsing is delegated to commit-gauge/parser', () => {
  const src = readFileSync(new URL('../src/commits.js', import.meta.url), 'utf8');
  assert.match(src, /from 'commit-gauge\/parser'/);
  assert.doesNotMatch(src, /const HEADER =/);
  const c = parseCommit('feat(x)!: y\n\nBREAKING CHANGE: z');
  assert.equal(c.breaking, cgParse('feat(x)!: y').breaking);
  assert.equal(c.type, 'feat'); assert.equal(c.conventional, true);
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies['commit-gauge'], '^1.0.0');
});

test('changesets: parse front matter and use as source of truth', () => {
  assert.deepEqual(parseChangeset('---\n"pkg-a": minor\n\'@s/b\': major\n---\n\nAdd thing\n'), { releases: { 'pkg-a': 'minor', '@s/b': 'major' }, summary: 'Add thing' });
  assert.equal(parseChangeset('no front matter'), null);
  const d = repo({ 'package.json': { name: 'p', version: '1.2.0' }, 'CHANGELOG.md': CL(['1.2.0', '- a']) });
  g(d, 'tag', 'v1.2.0');
  commit(d, 'docs: just docs', { '.changeset/brave-cat.md': '---\n"p": minor\n---\n\nNew API\n', '.changeset/README.md': 'readme' });
  const pending = check(d, { now });
  assert.equal(pending.info.source, 'changesets'); assert.equal(pending.info.required, 'minor');
  assert.deepEqual(pending.info.changesets, ['.changeset/brave-cat.md']);
  assert.deepEqual(rules(pending), ['pending-release']);
  const viaCommits = check(d, { now, source: 'commits' });
  assert.equal(viaCommits.info.required, 'none');
  assert.equal(readChangesets(tmp()), null);
  assert.equal(run(['--source', 'changesets'], tmp()).code, 2);
});

test('API surface: extract exports and classify removed/changed/added', () => {
  const before = 'export declare function a(x: string): number;\nexport interface Opts { x?: number }\nexport type T = string;\nexport { b as c } from "./b";\nexport * from "./core.js";\n';
  const api = extractApi(before);
  assert.deepEqual([...api.keys()].sort(), ['* from ./core.js', 'Opts', 'T', 'a', 'c']);
  assert.equal(diffApi(before, before).level, 'none');
  assert.equal(diffApi(before, before + 'export declare const z: 1;').level, 'minor');
  const changed = diffApi(before, before.replace('a(x: string)', 'a(x: string, y: boolean)'));
  assert.deepEqual(changed.changed, ['a']); assert.equal(changed.level, 'major');
  assert.deepEqual(diffApi(before, before.replace('export type T = string;\n', '')).removed, ['T']);
  // whitespace and comments don't count as changes
  assert.equal(diffApi(before, '/** doc */\n' + before.replace('a(x: string)', 'a( x : string )')).level, 'none');
});

test('API diff catches a breaking change labelled as fix', () => {
  const d = repo({ 'package.json': { name: 'p', version: '1.2.0' }, 'CHANGELOG.md': CL(['1.2.0', '- a']), 'index.d.ts': 'export declare function a(x: string): void;\nexport declare function b(): void;\n' });
  g(d, 'tag', 'v1.2.0');
  commit(d, 'fix: tidy', { 'index.d.ts': 'export declare function a(x: number): void;\n' });
  const pj = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')); pj.version = '1.2.1';
  commit(d, 'chore(release): 1.2.1', { 'package.json': pj, 'CHANGELOG.md': CL(['1.2.1', '- fix', '2026-10-14'], ['1.2.0', '- a']) });
  const r = check(d, { now, api: 'index.d.ts' });
  assert.deepEqual(rules(r), ['api-breaking-change', 'insufficient-bump']);
  assert.deepEqual(r.info.api.removed, ['b']); assert.deepEqual(r.info.api.changed, ['a']);
  const cli = run(['--api', 'index.d.ts', '-f', 'json'], d);
  assert.equal(cli.code, 1); assert.ok(JSON.parse(cli.out).findings.some((f) => f.rule === 'api-breaking-change'));
});

test('monorepo: per-package versions, tags, commits and changesets', () => {
  const d = repo({
    'package.json': { name: 'root', private: true, workspaces: ['packages/*'] },
    'packages/a/package.json': { name: '@s/a', version: '1.0.0' }, 'packages/a/CHANGELOG.md': CL(['1.0.0', '- a']),
    'packages/b/package.json': { name: 'b', version: '2.0.0' }, 'packages/b/CHANGELOG.md': CL(['2.0.0', '- b']),
    'packages/priv/package.json': { name: 'priv', version: '0.0.0', private: true },
  });
  g(d, 'tag', '@s/a@1.0.0'); g(d, 'tag', 'b@2.0.0');
  assert.deepEqual(listWorkspaces(d).map((w) => w.name), ['@s/a', 'b', 'priv']);
  commit(d, 'feat: a feature', { 'packages/a/x.js': '1' });
  commit(d, 'fix: b fix', { 'packages/b/x.js': '1' });
  const r = checkWorkspaces(d, { now, requireBump: true });
  assert.deepEqual(r.packages.map((p) => [p.name, p.baseVersion, p.required]), [['@s/a', '1.0.0', 'minor'], ['b', '2.0.0', 'patch']]);
  assert.deepEqual(rules(r), ['version-not-bumped', 'version-not-bumped']);
  assert.match(r.findings[0].message, /^@s\/a: /);
  write(d, { '.changeset/x.md': '---\n"b": major\n"ghost": patch\n---\nBig\n' });
  const r2 = checkWorkspaces(d, { now });
  assert.equal(r2.packages.find((p) => p.name === 'b').required, 'major');
  assert.ok(r2.findings.some((f) => f.rule === 'changeset-unknown-package'));
  const cli = run(['--workspaces', '-f', 'json', '--fail-on', 'none'], d);
  assert.equal(cli.code, 0, cli.err); assert.equal(JSON.parse(cli.out).packages.length, 2);
  assert.equal(run(['--workspaces'], tmp()).code, 2);
});
