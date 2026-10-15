// Changesets (.changeset/*.md) as an alternative source of truth to commits.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parse one changeset file: YAML front matter of `"pkg": level` lines, then a summary.
 * @param {string} text
 * @returns {{ releases: Record<string, 'major'|'minor'|'patch'|'none'>, summary: string } | null}
 */
export function parseChangeset(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(text).replace(/^\uFEFF/, ''));
  if (!m) return null;
  const releases = {};
  for (const line of m[1].split(/\r?\n/)) {
    const r = /^\s*["']?([^"':]+(?::[^"':]+)?)["']?\s*:\s*["']?(major|minor|patch|none)["']?\s*$/.exec(line);
    if (r) releases[r[1].trim()] = r[2];
  }
  return { releases, summary: m[2].trim() };
}

/**
 * Read pending changesets from <root>/.changeset. Returns null when the directory doesn't exist.
 * @param {string} root
 * @returns {{ file: string, releases: Record<string, string>, summary: string }[] | null}
 */
export function readChangesets(root) {
  const dir = join(root, '.changeset');
  if (!existsSync(dir)) return null;
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.md') || /^readme\.md$/i.test(f)) continue;
    const cs = parseChangeset(readFileSync(join(dir, f), 'utf8'));
    if (cs) out.push({ file: `.changeset/${f}`, ...cs });
  }
  return out;
}

const RANK = ['none', 'patch', 'minor', 'major'];
/** Highest level requested for a package across changesets. */
export function changesetLevel(changesets, name) {
  let lvl = 'none'; const files = [];
  for (const c of changesets) { const l = c.releases[name]; if (l) { files.push(c.file); if (RANK.indexOf(l) > RANK.indexOf(lvl)) lvl = l; } }
  return { level: lvl, files };
}
