// API-surface diff for TypeScript declaration files (in the spirit of api-extractor), dependency-free.
// It compares exported declarations of a .d.ts between the last release and now.

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s*([(){}<>,;:=|&?[\]])\s*/g, '$1').replace(/;+$/, '').trim();

/**
 * Extract exported declarations from .d.ts text: name -> normalised signature.
 * Handles `export (declare)? function|const|let|class|interface|type|enum|namespace`, overloads,
 * `export { a, b as c }`, `export default`, and `export * from '...'` (recorded as `* from <module>`).
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function extractApi(text) {
  const src = strip(String(text));
  const api = new Map();
  const add = (k, v) => api.set(k, api.has(k) ? `${api.get(k)} | ${v}` : v);
  // block declarations (balanced braces) and single-line ones
  const re = /export\s+(?:declare\s+)?(?:abstract\s+)?(function|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length; let depth = 0; let end = i;
    for (; end < src.length; end++) {
      const ch = src[end];
      if (ch === '{' || ch === '(' || ch === '<' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === '>' || ch === ']') { depth--; if (depth === 0 && ch === '}' && /class|interface|enum|namespace/.test(m[1])) { end++; break; } }
      else if (ch === ';' && depth <= 0) break;
      else if (ch === '\n' && depth <= 0 && /function|const|let|var|type/.test(m[1]) && !/[=|&,(:]\s*$/.test(src.slice(i, end))) break;
    }
    add(m[2], norm(`${m[1]} ${m[2]}${src.slice(i, end)}`));
    re.lastIndex = end;
  }
  for (const b of src.matchAll(/export\s*(type\s*)?\{([^}]*)\}(\s*from\s*['"]([^'"]+)['"])?/g)) {
    for (const part of b[2].split(',').map((x) => x.trim()).filter(Boolean)) {
      const [orig, alias] = part.replace(/^type\s+/, '').split(/\s+as\s+/);
      add((alias || orig).trim(), `re-export ${orig.trim()}${b[4] ? ` from ${b[4]}` : ''}`);
    }
  }
  for (const s of src.matchAll(/export\s*\*\s*(?:as\s+(\w+)\s*)?from\s*['"]([^'"]+)['"]/g)) add(s[1] || `* from ${s[2]}`, `export * from ${s[2]}`);
  if (/export\s+default\b/.test(src)) add('default', norm(/export\s+default\s+([^;\n]*)/.exec(src)[1]));
  return api;
}

/**
 * Diff two API maps. Removed or changed exports are breaking (major); added ones are minor.
 * @param {string} before .d.ts text at the last release
 * @param {string} after  current .d.ts text
 * @returns {{ removed: string[], changed: string[], added: string[], level: 'major'|'minor'|'none' }}
 */
export function diffApi(before, after) {
  const a = extractApi(before); const b = extractApi(after);
  const removed = [...a.keys()].filter((k) => !b.has(k));
  const changed = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k));
  const added = [...b.keys()].filter((k) => !a.has(k));
  return { removed, changed, added, level: removed.length || changed.length ? 'major' : added.length ? 'minor' : 'none' };
}
