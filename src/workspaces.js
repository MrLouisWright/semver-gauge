// Read the workspace list (npm/yarn "workspaces", pnpm-workspace.yaml). Only for per-package versioning;
// workspace hygiene checks belong to monorepo-gauge.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function patternsOf(root) {
  let pj = {}; try { pj = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch {}
  let pats = Array.isArray(pj.workspaces) ? pj.workspaces : pj.workspaces?.packages || [];
  const pnpm = join(root, 'pnpm-workspace.yaml');
  if (!pats.length && existsSync(pnpm)) {
    let inPk = false;
    for (const l of readFileSync(pnpm, 'utf8').split(/\r?\n/)) {
      if (/^packages:\s*$/.test(l)) { inPk = true; continue; }
      if (inPk && /^\s*-\s*/.test(l)) pats.push(l.replace(/^\s*-\s*/, '').replace(/^['"]|['"]$/g, '').trim());
      else if (inPk && /^\S/.test(l)) inPk = false;
    }
  }
  return pats;
}

/**
 * List workspace packages: [{ name, version, dir (absolute), path (relative), private }].
 * Supports "dir/*", "dir/**" and literal paths; "!pattern" excludes.
 * @param {string} root
 */
export function listWorkspaces(root) {
  const pats = patternsOf(root);
  const neg = pats.filter((p) => p.startsWith('!')).map((p) => p.slice(1).replace(/\/$/, ''));
  const dirs = new Set();
  const walk = (base, deep) => { if (!existsSync(base)) return; for (const e of readdirSync(base)) { if (e === 'node_modules' || e.startsWith('.')) continue; const d = join(base, e); if (!statSync(d).isDirectory()) continue; if (existsSync(join(d, 'package.json'))) dirs.add(d); if (deep) walk(d, true); } };
  for (const p of pats.filter((x) => !x.startsWith('!'))) {
    const clean = p.replace(/^\.\//, '').replace(/\/$/, '');
    if (clean.endsWith('/**')) walk(join(root, clean.slice(0, -3)), true);
    else if (clean.endsWith('/*')) walk(join(root, clean.slice(0, -2)), false);
    else if (existsSync(join(root, clean, 'package.json'))) dirs.add(join(root, clean));
  }
  const out = [];
  for (const d of [...dirs].sort()) {
    const rel = relative(root, d).split('\\').join('/');
    if (neg.some((n) => rel === n || (n.endsWith('/*') && rel.startsWith(n.slice(0, -1))))) continue;
    let pj; try { pj = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')); } catch { continue; }
    out.push({ name: pj.name || rel, version: pj.version, dir: d, path: rel, private: !!pj.private });
  }
  return out;
}
