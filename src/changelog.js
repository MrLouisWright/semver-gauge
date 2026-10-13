// CHANGELOG.md parsing: "## [1.2.0] - 2026-01-01", "## 1.2.0 (2026-01-01)", "# v1.2.0", "## [Unreleased]".
const HEAD = /^(#{1,3})\s+(.*)$/;
const VER = /\[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\]?(?:\([^)]*\))?/;
const DATE = /(\d{4}-\d{2}-\d{2})/;

export function parseChangelog(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let cur = null; let level = null; let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && HEAD.exec(line);
    if (m) {
      const depth = m[1].length; const title = m[2].trim();
      const v = VER.exec(title); const unreleased = /^\[?unreleased\]?/i.test(title);
      if ((v && v.index <= 2) || unreleased) {
        if (level === null) level = depth;
        if (depth === level) { cur = { version: unreleased ? null : v[1], unreleased, title, line: i + 1, date: DATE.exec(title)?.[1] || null, body: [] }; entries.push(cur); return; }
      } else if (level !== null && depth <= level) { cur = null; return; }
    }
    if (cur) cur.body.push(line);
  });
  for (const e of entries) { e.text = e.body.join('\n').replace(/^\[[^\]]+\]:\s*\S+\s*$/gm, '').trim(); delete e.body; }
  return entries;
}
