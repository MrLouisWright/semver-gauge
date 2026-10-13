import { execFileSync } from 'node:child_process';

export function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trimEnd();
}
export function tryGit(dir, args) { try { return git(dir, args); } catch { return null; } }
export const isRepo = (dir) => tryGit(dir, ['rev-parse', '--is-inside-work-tree']) === 'true';

/** Latest reachable release tag (v1.2.3 or 1.2.3 by default). */
export function latestTag(dir, match = ['v[0-9]*', '[0-9]*']) {
  for (const m of match) { const t = tryGit(dir, ['describe', '--tags', '--abbrev=0', '--match', m, 'HEAD']); if (t) return t; }
  return null;
}

/** Commit messages in base..HEAD that touch `dir` (newest first). */
export function commitsSince(dir, base) {
  const out = git(dir, ['log', '--no-merges', '--format=%H%x1f%B%x1e', base ? `${base}..HEAD` : 'HEAD', '--', '.']);
  return out.split('\x1e').map((s) => s.trim()).filter(Boolean).map((s) => { const [sha, msg] = s.split('\x1f'); return { sha, message: (msg || '').trim() }; });
}
export const showFile = (dir, ref, path) => tryGit(dir, ['show', `${ref}:./${path}`]);
export const tagExists = (dir, tag) => tryGit(dir, ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]) !== null;
