// Text tools: case conversion, diff (Myers), lorem ipsum, text stats. Pure.

/* ---------------------------------------------------------------- case */
/** Split any identifier/sentence into words: "XMLHttpRequest2Go" -> [XML, Http, Request2, Go] */
export function words(s) {
  return String(s)
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')          // fooBar -> foo Bar, 2Go -> 2 Go
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')        // XMLHttp -> XML Http
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
const cap = (w) => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'via', 'vs']);

export const CASES = [
  { id: 'camel', label: 'camelCase', fn: (w) => w.map((x, i) => i ? cap(x) : x.toLowerCase()).join('') },
  { id: 'pascal', label: 'PascalCase', fn: (w) => w.map(cap).join('') },
  { id: 'snake', label: 'snake_case', fn: (w) => w.map((x) => x.toLowerCase()).join('_') },
  { id: 'constant', label: 'CONSTANT_CASE', fn: (w) => w.map((x) => x.toUpperCase()).join('_') },
  { id: 'kebab', label: 'kebab-case', fn: (w) => w.map((x) => x.toLowerCase()).join('-') },
  { id: 'train', label: 'Train-Case', fn: (w) => w.map(cap).join('-') },
  { id: 'dot', label: 'dot.case', fn: (w) => w.map((x) => x.toLowerCase()).join('.') },
  { id: 'path', label: 'path/case', fn: (w) => w.map((x) => x.toLowerCase()).join('/') },
  { id: 'title', label: 'Title Case', fn: (w) => w.map((x, i) => (i && i < w.length - 1 && SMALL.has(x.toLowerCase())) ? x.toLowerCase() : cap(x)).join(' ') },
  { id: 'sentence', label: 'Sentence case', fn: (w) => w.map((x, i) => i ? x.toLowerCase() : cap(x)).join(' ') },
  { id: 'lower', label: 'lower case', fn: (w) => w.map((x) => x.toLowerCase()).join(' ') },
  { id: 'upper', label: 'UPPER CASE', fn: (w) => w.map((x) => x.toUpperCase()).join(' ') },
];
export function convertCase(s, id) {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error('Unknown case ' + id);
  // keep acronyms readable: words() returns original casing; fns normalize
  return String(s).split('\n').map((line) => c.fn(words(line))).join('\n');
}

/* ---------------------------------------------------------------- diff */
/** Myers O(ND) diff on token arrays -> [{ op: '=', '-', '+', items:[...] }] */
export function diffArrays(a, b, eq = (x, y) => x === y) {
  // trim common prefix/suffix for speed
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start], b[start])) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) { endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB);
  const N = A.length, M = B.length, MAX = N + M;
  const ops = [];
  if (N === 0 || M === 0) {
    if (N) ops.push(...A.map((x) => ['-', x]));
    if (M) ops.push(...B.map((x) => ['+', x]));
  } else {
    const V = new Int32Array(2 * MAX + 2);
    const trace = [];
    let found = false;
    for (let d = 0; d <= MAX && !found; d++) {
      trace.push(V.slice());
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && V[MAX + k - 1] < V[MAX + k + 1])) x = V[MAX + k + 1];
        else x = V[MAX + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && eq(A[x], B[y])) { x++; y++; }
        V[MAX + k] = x;
        if (x >= N && y >= M) { found = true; break; }
      }
      if (d > 20000) throw new Error('Inputs too different to diff quickly');
    }
    trace.push(V.slice());
    // backtrack
    let x = N, y = M;
    for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
      const v = trace[d];
      const k = x - y;
      let prevK;
      if (k === -d || (k !== d && v[MAX + k - 1] < v[MAX + k + 1])) prevK = k + 1; else prevK = k - 1;
      const prevX = d === 0 ? 0 : v[MAX + prevK];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) { ops.push(['=', A[x - 1]]); x--; y--; }
      if (d > 0) { if (x === prevX) ops.push(['+', B[y - 1]]); else ops.push(['-', A[x - 1]]); }
      x = prevX; y = prevY;
      if (d === 0) break;
    }
    ops.reverse();
  }
  const all = [...a.slice(0, start).map((x) => ['=', x]), ...ops, ...a.slice(endA).map((x) => ['=', x])];
  // group: within each change block, all removals first, then all additions
  const out = [];
  let del = [], add = [];
  const flush = () => { if (del.length) out.push({ op: '-', items: del }); if (add.length) out.push({ op: '+', items: add }); del = []; add = []; };
  for (const [op, item] of all) {
    if (op === '-') { del.push(item); continue; }
    if (op === '+') { add.push(item); continue; }
    flush();
    const last = out[out.length - 1];
    if (last && last.op === '=') last.items.push(item); else out.push({ op: '=', items: [item] });
  }
  flush();
  return out;
}

export function tokenize(s, mode) {
  if (mode === 'line') return s === '' ? [] : s.split('\n');
  if (mode === 'char') return Array.from(s);
  return s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
}

/** diffText(a, b, mode='line'|'word'|'char', { ignoreCase, ignoreWhitespace }) -> { chunks, added, removed } */
export function diffText(a, b, mode = 'line', { ignoreCase = false, ignoreWhitespace = false } = {}) {
  const norm = (x) => { let t = x; if (ignoreWhitespace) t = t.replace(/\s+/g, ' ').trim(); if (ignoreCase) t = t.toLowerCase(); return t; };
  const ta = tokenize(a, mode), tb = tokenize(b, mode);
  const chunks = diffArrays(ta, tb, (x, y) => norm(x) === norm(y));
  let added = 0, removed = 0;
  for (const c of chunks) { if (c.op === '+') added += c.items.length; if (c.op === '-') removed += c.items.length; }
  return { chunks, added, removed, same: added === 0 && removed === 0 };
}

/** Rows for a side-by-side line view: [{ left:{n,text}|null, right:{n,text}|null, type:'same'|'del'|'add'|'mod' }] */
export function sideBySide(chunks) {
  const rows = [];
  let ln = 1, rn = 1;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (c.op === '=') { for (const t of c.items) rows.push({ left: { n: ln++, text: t }, right: { n: rn++, text: t }, type: 'same' }); continue; }
    if (c.op === '-' && chunks[i + 1] && chunks[i + 1].op === '+') {
      const del = c.items, add = chunks[i + 1].items;
      const n = Math.max(del.length, add.length);
      for (let j = 0; j < n; j++) {
        const L = j < del.length ? { n: ln++, text: del[j] } : null;
        const R = j < add.length ? { n: rn++, text: add[j] } : null;
        rows.push({ left: L, right: R, type: L && R ? 'mod' : L ? 'del' : 'add' });
      }
      i++; continue;
    }
    for (const t of c.items) rows.push(c.op === '-' ? { left: { n: ln++, text: t }, right: null, type: 'del' } : { left: null, right: { n: rn++, text: t }, type: 'add' });
  }
  return rows;
}

/** unified diff text (---/+++ with @@ hunks, 3 lines of context) */
export function unified(chunks, { context = 3, nameA = 'a', nameB = 'b' } = {}) {
  const lines = [];
  for (const c of chunks) for (const t of c.items) lines.push({ op: c.op === '=' ? ' ' : c.op, t });
  const out = [`--- ${nameA}`, `+++ ${nameB}`];
  let i = 0, la = 1, lb = 1;
  const pos = [];
  for (const l of lines) { pos.push([la, lb]); if (l.op !== '+') la++; if (l.op !== '-') lb++; }
  while (i < lines.length) {
    if (lines[i].op === ' ') { i++; continue; }
    let s = Math.max(0, i - context);
    let e = i;
    let lastChange = i;
    while (e < lines.length && (lines[e].op !== ' ' || e - lastChange <= context * 2)) { if (lines[e].op !== ' ') lastChange = e; e++; }
    e = Math.min(lines.length, lastChange + context + 1);
    const seg = lines.slice(s, e);
    const ca = seg.filter((l) => l.op !== '+').length, cb = seg.filter((l) => l.op !== '-').length;
    out.push(`@@ -${pos[s][0]},${ca} +${pos[s][1]},${cb} @@`);
    for (const l of seg) out.push(l.op + l.t);
    i = e;
  }
  return out.join('\n');
}

/* ---------------------------------------------------------------- lorem */
const LOREM = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum ' +
  'curabitur pretium tincidunt lacus nulla gravida orci a odio nullam varius turpis et commodo pharetra est eros bibendum elit nec luctus magna felis sollicitudin mauris integer in mauris eu nibh euismod gravida duis ac tellus et risus vulputate vehicula donec lobortis risus a elit etiam tempor ut ullamcorper ligula eu tempor congue eros est euismod turpis id tincidunt sapien risus a quam maecenas fermentum consequat mi donec fermentum pellentesque malesuada nulla a mi duis sapien sem aliquet nec commodo eget consequat quis neque aliquam faucibus elit ut dictum aliquet felis nisl adipiscing sapien sed malesuada diam lacus eget erat cras mollis scelerisque nunc nullam arcu aliquam consequat').split(' ');

/** mulberry32 PRNG for reproducible lorem */
export function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** lorem({ unit:'paragraphs'|'sentences'|'words', count, classic, seed, html }) */
export function lorem({ unit = 'paragraphs', count = 3, classic = true, seed = 1, html = false } = {}) {
  const rnd = prng(seed);
  const pick = () => LOREM[Math.floor(rnd() * LOREM.length)];
  const range = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  let first = classic;
  const sentence = () => {
    let w;
    if (first) { w = 'Lorem ipsum dolor sit amet consectetur adipiscing elit'.split(' '); first = false; const extra = range(0, 6); for (let i = 0; i < extra; i++) w.push(pick()); }
    else { const n = range(6, 16); w = []; for (let i = 0; i < n; i++) w.push(pick()); if (n > 9 && rnd() < .5) w[range(3, n - 4)] += ','; }
    const s = w.join(' ');
    return s[0].toUpperCase() + s.slice(1) + (rnd() < .08 ? '?' : '.');
  };
  const n = Math.max(1, Math.min(unit === 'words' ? 5000 : 500, count | 0));
  if (unit === 'words') {
    const w = classic ? 'lorem ipsum dolor sit amet consectetur adipiscing elit'.split(' ').slice(0, n) : [];
    while (w.length < n) w.push(pick());
    const s = w.join(' ');
    return s[0].toUpperCase() + s.slice(1);
  }
  if (unit === 'sentences') return Array.from({ length: n }, sentence).join(' ');
  const paras = Array.from({ length: n }, () => Array.from({ length: range(3, 6) }, sentence).join(' '));
  return html ? paras.map((p) => `<p>${p}</p>`).join('\n') : paras.join('\n\n');
}

export function stats(s) {
  const t = String(s);
  return {
    chars: [...t].length,
    words: (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length,
    lines: t ? t.split('\n').length : 0,
    bytes: new TextEncoder().encode(t).length,
  };
}
