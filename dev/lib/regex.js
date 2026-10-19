// Regex tester core (JavaScript flavor). Pure; the page runs it inside a Worker with a timeout.

export function compile(pattern, flags) {
  const f = [...new Set(String(flags || '').split(''))].join('');
  return new RegExp(pattern, f);
}

/**
 * run(pattern, flags, text, { limit }) -> { matches:[{ index, end, text, groups:[{ n, name, value, start, end }] }], truncated, groupNames }
 * Always scans globally for the match list (like regex101); `g` only affects replace().
 */
export function run(pattern, flags, text, { limit = 1000 } = {}) {
  const base = compile(pattern, flags);
  let f = base.flags.includes('g') ? base.flags : base.flags + 'g';
  if (!f.includes('d')) f += 'd';
  const re = new RegExp(base.source, f);
  const names = groupNamesByIndex(pattern);
  const matches = [];
  let truncated = false;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (matches.length >= limit) { truncated = true; break; }
    const groups = [];
    for (let i = 1; i < m.length; i++) {
      const ix = m.indices && m.indices[i];
      groups.push({ n: i, name: names[i] || null, value: m[i], start: ix ? ix[0] : -1, end: ix ? ix[1] : -1 });
    }
    matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups });
    if (m[0] === '') re.lastIndex += (f.includes('u') || f.includes('v')) && text.codePointAt(m.index) > 0xffff ? 2 : 1;
    if (f.includes('y') && !base.flags.includes('g')) break;
  }
  return { matches, truncated, groupNames: names.filter(Boolean), groupCount: countGroups(pattern) };
}

/** capture-group names by index (1-based) from the pattern source: [ , 'year', null, ...] */
export function groupNamesByIndex(pattern) {
  const names = [undefined];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c !== '(') continue;
    if (pattern[i + 1] !== '?') { names.push(null); continue; }
    const m = /^\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i + 1));
    if (m) names.push(m[1]);
  }
  return names;
}

/** number of capture groups in a pattern (best effort, by compiling an alternation with empty string) */
export function countGroups(pattern) {
  try { return new RegExp('(?:' + pattern + ')|').exec('').length - 1; } catch { return 0; }
}

export function replace(pattern, flags, text, replacement) {
  const re = compile(pattern, flags);
  return text.replace(re, replacement);
}

/** Split text into segments [{text, match: index|-1}] for highlighting */
export function segments(text, matches) {
  const out = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.index > pos) out.push({ text: text.slice(pos, m.index), match: -1 });
    if (m.end > m.index) out.push({ text: text.slice(m.index, m.end), match: i });
    else out.push({ text: '', match: i, empty: true });
    pos = Math.max(pos, m.end);
  });
  if (pos < text.length) out.push({ text: text.slice(pos), match: -1 });
  return out;
}

export const COMMON = [
  { name: 'Email address', pattern: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+', flags: 'g', sample: 'Write to hello@example.com or ops+alerts@mail.example.co.uk' },
  { name: 'URL', pattern: 'https?:\\/\\/[^\\s/$.?#].[^\\s]*', flags: 'gi', sample: 'Docs: https://example.com/docs?page=2 and http://localhost:8080/' },
  { name: 'IPv4 address', pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', flags: 'g', sample: 'Hosts 192.168.1.20, 10.0.0.1 and 256.1.1.1 (invalid)' },
  { name: 'ISO date (named groups)', pattern: '(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])', flags: 'g', sample: 'Released 2026-10-11, patched 2026-11-02.' },
  { name: 'Time 24h', pattern: '\\b([01]\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?\\b', flags: 'g', sample: 'Standup 09:30, deploy 17:05:30, never 25:00' },
  { name: 'Hex color', pattern: '#(?:[0-9a-fA-F]{3,4}){1,2}\\b', flags: 'g', sample: 'Accent #8b5cf6, text #fff, shadow #0008' },
  { name: 'UUID', pattern: '\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b', flags: 'gi', sample: 'id=0192f1e8-7c3a-7b4e-9d1f-2a6b8c0d4e5f ok' },
  { name: 'US phone', pattern: '\\(?\\b(\\d{3})\\)?[-.\\s]?(\\d{3})[-.\\s]?(\\d{4})\\b', flags: 'g', sample: 'Call (212) 555-0147 or 646.555.0199' },
  { name: 'Number (int/float)', pattern: '-?\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b', flags: 'gi', sample: 'x = 42, y = -3.14, z = 6.02e23' },
  { name: 'Whitespace runs', pattern: '[ \\t]{2,}', flags: 'g', sample: 'too   many    spaces\there' },
  { name: 'Duplicate words', pattern: '\\b(\\w+)\\s+\\1\\b', flags: 'gi', sample: 'This is is a test of the the regex.' },
  { name: 'HTML tag', pattern: '<\\/?([a-z][a-z0-9-]*)\\b[^>]*>', flags: 'gi', sample: '<div class="x"><b>bold</b></div>' },
  { name: 'Semver', pattern: '\\bv?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([\\w.-]+))?(?:\\+([\\w.-]+))?\\b', flags: 'g', sample: 'Upgrade 1.4.2 → v2.0.0-rc.1+build.5' },
  { name: 'Slug', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', flags: 'gm', sample: 'my-cool-post\nNot A Slug\nanother-one-2' },
];
