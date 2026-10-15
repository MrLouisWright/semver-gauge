// Conventional Commits handling. Parsing comes from commit-gauge's shared parser (commit-gauge/parser);
// semver-gauge only maps parsed commits to release levels and adds no lint rules of its own.
import { parseCommit as parse } from 'commit-gauge/parser';

export const DEFAULT_TYPES = { feat: 'minor', fix: 'patch', perf: 'patch', revert: 'patch', docs: 'none', style: 'none', refactor: 'none', test: 'none', build: 'none', ci: 'none', chore: 'none' };

/**
 * Parse one commit message (commit-gauge/parser) and add the fields semver-gauge relies on.
 * @param {string} message
 */
export function parseCommit(message) {
  const c = parse(message);
  return { ...c, type: c.type ? c.type.toLowerCase() : null, subject: c.conventional ? c.subject : c.header, body: [c.body, ...c.footers.map((f) => `${f.token}: ${f.value}`)].filter(Boolean).join('\n\n') };
}

/** Bump a commit requires: major | minor | patch | none | unknown (non-conventional). */
export function commitLevel(c, types = DEFAULT_TYPES) {
  if (c.breaking) return 'major';
  if (!c.conventional) return 'unknown';
  return types[c.type] ?? 'none';
}

export const isMergeOrRelease = (c) => /^Merge (pull request|branch|remote-tracking)/.test(c.header) || /^Revert "/.test(c.header) || /^(release|chore\(release\)):? v?\d+\.\d+\.\d+/i.test(c.header) || /^v?\d+\.\d+\.\d+$/.test(c.header) || /^release v?\d/i.test(c.header);
