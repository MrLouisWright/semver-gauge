// Conventional Commits parsing (https://www.conventionalcommits.org/en/v1.0.0/).
const HEADER = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^()\r\n]*)\))?(?<bang>!)?: (?<subject>\S.*)$/;
const BREAKING = /^BREAKING[ -]CHANGE: /m;

export const DEFAULT_TYPES = { feat: 'minor', fix: 'patch', perf: 'patch', revert: 'patch', docs: 'none', style: 'none', refactor: 'none', test: 'none', build: 'none', ci: 'none', chore: 'none' };

/** Parse one commit message. Returns { conventional, type, scope, breaking, subject, header, body }. */
export function parseCommit(message) {
  const msg = String(message).replace(/\r\n/g, '\n').trim();
  const [header, ...rest] = msg.split('\n');
  const body = rest.join('\n').trim();
  const m = HEADER.exec(header);
  if (!m) return { conventional: false, header, body, breaking: BREAKING.test(body), type: null, scope: null, subject: header };
  return { conventional: true, header, body, type: m.groups.type.toLowerCase(), scope: m.groups.scope ?? null, subject: m.groups.subject, breaking: !!m.groups.bang || BREAKING.test(body) };
}

/** Bump a commit requires: major | minor | patch | none | unknown (non-conventional). */
export function commitLevel(c, types = DEFAULT_TYPES) {
  if (c.breaking) return 'major';
  if (!c.conventional) return 'unknown';
  return types[c.type] ?? 'none';
}

export const isMergeOrRelease = (c) => /^Merge (pull request|branch|remote-tracking)/.test(c.header) || /^Revert "/.test(c.header) || /^(release|chore\(release\)):? v?\d+\.\d+\.\d+/i.test(c.header) || /^v?\d+\.\d+\.\d+$/.test(c.header) || /^release v?\d/i.test(c.header);
