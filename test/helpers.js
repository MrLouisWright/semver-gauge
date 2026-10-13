import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../bin/semver-gauge.js', import.meta.url));
export const tmp = () => mkdtempSync(join(tmpdir(), 'sg-'));
export function write(dir, files) { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), typeof c === 'string' ? c : JSON.stringify(c, null, 2)); } return dir; }
export const g = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e', GIT_CONFIG_NOSYSTEM: '1', HOME: dir } });
export function repo(files) { const d = tmp(); g(d, 'init', '-q', '-b', 'main'); write(d, files); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'chore: init'); return d; }
export function commit(d, msg, files = { [`f${Math.random().toString(36).slice(2)}.txt`]: 'x' }) { write(d, files); g(d, 'add', '-A'); g(d, 'commit', '-qm', msg); }
export function run(args, cwd) { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }); return { code: r.status, out: r.stdout, err: r.stderr }; }
export const CL = (...entries) => '# Changelog\n\n' + entries.map(([v, body, date = '2026-01-01']) => `## ${v} (${date})\n\n${body}\n`).join('\n');
