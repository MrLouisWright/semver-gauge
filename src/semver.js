// Minimal SemVer 2.0.0 parsing and comparison.
const RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function parse(v) {
  const m = RE.exec(String(v ?? '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [], build: m[5] || '', raw: String(v).trim().replace(/^v/, '') };
}

export const valid = (v) => parse(v) !== null;

function cmpPre(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]); const nb = /^\d+$/.test(b[i]);
    if (na && nb) { const d = +a[i] - +b[i]; if (d) return Math.sign(d); } else if (na) return -1; else if (nb) return 1; else if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function compare(a, b) {
  const x = typeof a === 'string' ? parse(a) : a; const y = typeof b === 'string' ? parse(b) : b;
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  return cmpPre(x.pre, y.pre);
}

export const LEVELS = ['none', 'patch', 'minor', 'major'];

/** Classify the bump from -> to: none | patch | minor | major | prerelease | downgrade */
export function diff(from, to) {
  const a = parse(from); const b = parse(to);
  const c = compare(a, b);
  if (c === 0) return 'none';
  if (c > 0) return 'downgrade';
  if (a.major !== b.major) return 'major';
  if (a.minor !== b.minor) return 'minor';
  if (a.patch !== b.patch) return 'patch';
  return 'prerelease';
}

/** The next version for a bump level. */
export function inc(v, level) {
  const p = parse(v);
  if (level === 'major') return `${p.major + 1}.0.0`;
  if (level === 'minor') return `${p.major}.${p.minor + 1}.0`;
  if (level === 'patch') return p.pre.length ? `${p.major}.${p.minor}.${p.patch}` : `${p.major}.${p.minor}.${p.patch + 1}`;
  return p.raw;
}

/** Effective bump for a semver change, honouring 0.x rules (0.y.z: minor is breaking, patch is anything else). */
export function effectiveLevel(from, to) {
  const d = diff(from, to);
  if (d === 'none' || d === 'downgrade') return d;
  const a = parse(from); const b = parse(to);
  if (d === 'prerelease') return 'prerelease';
  // a pre-release of the next version (1.0.0 -> 2.0.0-rc.1) counts as that level
  if (a.major === 0 && b.major === 0) return d === 'minor' ? 'major' : 'minor-or-patch';
  return d;
}
