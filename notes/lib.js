// Notes: pure logic (no DOM). Tokenizer, language detection, line diff, checklists, JSON format/validate,
// a small SAFE markdown renderer (everything is escaped, no raw HTML ever), time helpers.
// Unit tests: node notes/notes.test.mjs

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ languages */
export const LANGS = [
  { id: 'plain', label: 'Plain text', ext: 'txt', exts: ['txt', 'text', 'rtf', 'csv', 'tsv'] },
  { id: 'markdown', label: 'Markdown', ext: 'md', exts: ['md', 'markdown', 'mdx'] },
  { id: 'json', label: 'JSON', ext: 'json', exts: ['json', 'jsonc', 'json5', 'geojson', 'webmanifest'] },
  { id: 'javascript', label: 'JavaScript', ext: 'js', exts: ['js', 'mjs', 'cjs', 'jsx'] },
  { id: 'typescript', label: 'TypeScript', ext: 'ts', exts: ['ts', 'tsx'] },
  { id: 'html', label: 'HTML', ext: 'html', exts: ['html', 'htm', 'svelte', 'vue'] },
  { id: 'css', label: 'CSS', ext: 'css', exts: ['css', 'scss', 'less'] },
  { id: 'python', label: 'Python', ext: 'py', exts: ['py', 'pyw'] },
  { id: 'shell', label: 'Shell', ext: 'sh', exts: ['sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1'] },
  { id: 'sql', label: 'SQL', ext: 'sql', exts: ['sql'] },
  { id: 'yaml', label: 'YAML', ext: 'yml', exts: ['yml', 'yaml', 'toml', 'ini', 'env'] },
  { id: 'xml', label: 'XML', ext: 'xml', exts: ['xml', 'svg', 'xsd', 'plist'] },
  { id: 'c', label: 'C / C++', ext: 'c', exts: ['c', 'h', 'cpp', 'hpp', 'cc', 'cs'] },
  { id: 'java', label: 'Java / Kotlin', ext: 'java', exts: ['java', 'kt', 'kts', 'swift'] },
  { id: 'go', label: 'Go', ext: 'go', exts: ['go'] },
  { id: 'rust', label: 'Rust', ext: 'rs', exts: ['rs'] },
  { id: 'php', label: 'PHP', ext: 'php', exts: ['php'] },
  { id: 'ruby', label: 'Ruby', ext: 'rb', exts: ['rb', 'rake'] },
  { id: 'diff', label: 'Diff / patch', ext: 'diff', exts: ['diff', 'patch'] },
  { id: 'log', label: 'Log', ext: 'log', exts: ['log'] },
];
export const LANG_IDS = LANGS.map((l) => l.id);
export const langInfo = (id) => LANGS.find((l) => l.id === id) || LANGS[0];
export const langLabel = (id) => langInfo(id).label;
export const langExt = (id) => langInfo(id).ext;
export function langFromFilename(name) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ''));
  if (!m) return null;
  const e = m[1].toLowerCase();
  const l = LANGS.find((x) => x.exts.includes(e));
  return l ? l.id : null;
}

/* ------------------------------------------------------------------ JSON: validate / locate error / format */
/** @returns {null|{pos:number,msg:string}} null when valid */
export function jsonError(src) {
  let i = 0; const n = src.length;
  const ws = () => { while (i < n && (src[i] === ' ' || src[i] === '\t' || src[i] === '\n' || src[i] === '\r')) i++; };
  const err = (msg, pos = i) => { throw { pos, msg }; };
  const str = () => {
    const start = i; i++;
    for (;;) {
      const c = src[i];
      if (c === undefined) err('This string is never closed', start);
      if (c === '"') { i++; return; }
      if (c === '\n') err('A line break inside a string (use \\n instead)', i);
      if (c === '\\') {
        const e = src[i + 1];
        if (e === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) err('Bad \\u escape', i); i += 6; continue; }
        if (e === undefined || !'"\\/bfnrt'.includes(e)) err('Bad escape sequence', i);
        i += 2; continue;
      }
      i++;
    }
  };
  const NUM = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
  const val = (depth) => {
    if (depth > 200) err('Nested too deeply');
    ws();
    if (i >= n) err('The text ends too early');
    const c = src[i];
    if (c === '{') {
      i++; ws();
      if (src[i] === '}') { i++; return; }
      for (;;) {
        ws();
        if (src[i] === undefined) err('The text ends too early');
        if (src[i] !== '"') err(src[i] === '}' ? 'A comma with nothing after it' : 'Keys need "double quotes"');
        str(); ws();
        if (src[i] !== ':') err('Expected ":" after the key');
        i++; val(depth + 1); ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return; }
        err(src[i] === undefined ? 'The text ends too early' : 'Expected "," or "}" here (missing comma?)');
      }
    }
    if (c === '[') {
      i++; ws();
      if (src[i] === ']') { i++; return; }
      for (;;) {
        ws();
        if (src[i] === ']') err('A comma with nothing after it');
        val(depth + 1); ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return; }
        err(src[i] === undefined ? 'The text ends too early' : 'Expected "," or "]" here (missing comma?)');
      }
    }
    if (c === '"') return str();
    for (const lit of ['true', 'false', 'null']) if (src.startsWith(lit, i)) { i += lit.length; return; }
    NUM.lastIndex = i;
    const m = NUM.exec(src);
    if (m && m[0]) { i += m[0].length; return; }
    err(c === "'" ? "Strings need \"double quotes\", not 'single'" : `Unexpected "${c}"`);
  };
  try {
    val(0); ws();
    if (i < n) err('Extra text after the JSON ended');
    return null;
  } catch (e) {
    if (e && typeof e.pos === 'number') return e;
    throw e;
  }
}
export function posToLineCol(text, pos) {
  let line = 1, last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) { line++; last = i; }
  return { line, col: pos - last };
}
/** Pretty-print JSON without parsing numbers (big numbers keep every digit). */
export function formatJson(text, indent = 2) {
  const e = jsonError(text);
  if (e) { const { line, col } = posToLineCol(text, e.pos); return { ok: false, line, col, pos: e.pos, message: `Line ${line}, column ${col}: ${e.msg}` }; }
  const pad = ' '.repeat(indent);
  let out = '', lvl = 0, i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') { let j = i + 1; while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1; out += text.slice(i, j + 1); i = j + 1; continue; }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '{' || c === '[') {
      let j = i + 1; while (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r') j++;
      if (text[j] === (c === '{' ? '}' : ']')) { out += c + text[j]; i = j + 1; continue; }
      lvl++; out += c + '\n' + pad.repeat(lvl); i++; continue;
    }
    if (c === '}' || c === ']') { lvl--; out += '\n' + pad.repeat(lvl) + c; i++; continue; }
    if (c === ',') { out += ',\n' + pad.repeat(lvl); i++; continue; }
    if (c === ':') { out += ': '; i++; continue; }
    out += c; i++;
  }
  return { ok: true, text: out };
}

/* ------------------------------------------------------------------ language detection */
export function detectLang(text) {
  const t = String(text).slice(0, 8000);
  const s = t.trim();
  if (s.length < 2) return 'plain';
  if (/^[[{]/.test(s)) {
    if (text.length < 400000 && !jsonError(text)) return 'json';
    if (/^[[{]\s*"[^"\n]*"\s*:/.test(s) || /^\[\s*[[{"\d]/.test(s)) return 'json';
  }
  if (/^diff --git |^@@ -\d+(,\d+)? \+\d+(,\d+)? @@|^--- a\/.*\n\+\+\+ b\//m.test(t)) return 'diff';
  const first = s.split('\n', 1)[0];
  if (/^#!.*\b(ba|z|da)?sh\b/.test(first)) return 'shell';
  if (/^#!.*\bpython/.test(first)) return 'python';
  if (/^#!.*\b(node|deno|bun)\b/.test(first)) return 'javascript';
  if (/^\s*<\?xml/i.test(s)) return 'xml';
  if (/^\s*<!doctype html|^\s*<html[\s>]|<\/(div|body|head|p|span|script|style|ul|li|a|h[1-6])>/i.test(t)) return 'html';
  if (/^\s*<([A-Za-z][\w:-]*)(\s[^<>]*)?>[\s\S]*<\/\1>\s*$/.test(s)) return 'xml';
  const sc = { python: 0, javascript: 0, css: 0, sql: 0, shell: 0, yaml: 0, markdown: 0, log: 0, typescript: 0, go: 0, rust: 0, java: 0, c: 0, php: 0 };
  const has = (re, w, k) => { if (re.test(t)) sc[k] += w; };
  has(/^\s*(def|class)\s+\w+.*:\s*$/m, 3, 'python'); has(/^\s*(elif|except|with .* as)\b.*:\s*$/m, 2, 'python'); has(/^\s*(import|from)\s+[\w.]+(\s+import\b.*)?\s*$/m, 1, 'python');
  has(/\bprint\(/, 1, 'python'); has(/\bself\b/, 1, 'python'); has(/^\s*if __name__ ==/m, 3, 'python');
  has(/\b(const|let|var)\s+[\w{[]/, 2, 'javascript'); has(/=>/, 1, 'javascript'); has(/\bfunction\b\s*\w*\s*\(/, 2, 'javascript'); has(/^import\s.+\sfrom\s['"]/m, 2, 'javascript');
  has(/console\.\w+\(/, 2, 'javascript'); has(/\brequire\(['"]/, 1, 'javascript'); has(/^export\s+(default|const|function|class)\b/m, 2, 'javascript'); has(/;\s*$/m, 1, 'javascript');
  has(/:\s*(string|number|boolean|void|any)\b|\binterface\s+\w+\s*\{|\bas\s+(const|string|number)\b|<[A-Z]\w*>\(/, 3, 'typescript');
  has(/^package\s+\w+\s*$/m, 2, 'go'); has(/^func\s+(\(\w+ \*?\w+\)\s*)?\w+\(/m, 3, 'go');
  has(/^\s*(pub\s+)?fn\s+\w+/m, 3, 'rust'); has(/\blet\s+mut\b|println!\(/, 3, 'rust');
  has(/\b(public|private)\s+(static\s+)?(class|void|int|String)\b/, 3, 'java'); has(/System\.out\.print/, 3, 'java');
  has(/^#include\s*[<"]/m, 4, 'c'); has(/\bint\s+main\s*\(/, 3, 'c');
  has(/^<\?php/, 5, 'php'); has(/\$\w+\s*=\s*.+;\s*$/m, 1, 'php');
  if (/[^{}\n]+\{[^{}]*[\w-]+\s*:\s*[^;{}]+;[^{}]*\}/.test(t)) sc.css += 4;
  has(/^\s*@(media|import|font-face|keyframes)\b/m, 3, 'css');
  has(/^\s*(select|insert\s+into|update|delete\s+from|create\s+(table|index|view)|alter\s+table|drop\s+table|with)\b[\s\S]*\b(from|into|set|values|table|select)\b/i, 4, 'sql');
  has(/^\s*(\$ |sudo |apt(-get)? |npm |npx |yarn |git |cd |ls\b|echo |curl |wget |export |chmod |mkdir |grep |cat |docker |pip )/m, 3, 'shell');
  has(/\s\|\s+\w+/, 1, 'shell'); has(/^\s*(if \[|for \w+ in |fi$|done$|esac$)/m, 2, 'shell');
  const lines = t.split('\n');
  const kv = lines.filter((l) => /^\s*(- )?[\w.-]+:(\s+\S.*)?$/.test(l)).length;
  if (kv >= 2 && kv >= lines.filter((l) => l.trim()).length * 0.6 && !/[{};]/.test(t)) sc.yaml += 3 + (/^---\s*$/m.test(t) ? 1 : 0);
  has(/^#{1,6}\s+\S/m, 2, 'markdown'); has(/^\s*([-*]|\d+\.)\s+\S/m, 1, 'markdown'); has(/\[[^\]\n]+\]\([^)\n]+\)/, 1, 'markdown'); has(/^```/m, 2, 'markdown');
  has(/^\s*[-*] \[[ xX]\]\s/m, 3, 'markdown'); has(/\*\*[^*\n]+\*\*/, 1, 'markdown'); has(/^>\s+\S/m, 1, 'markdown');
  const logish = lines.filter((l) => /\b(ERROR|WARN(ING)?|INFO|DEBUG|FATAL|TRACE)\b|^\[?\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(l)).length;
  if (logish >= 3 && logish >= lines.filter((l) => l.trim()).length * 0.5) sc.log += 4;
  if (sc.typescript >= 3 && sc.javascript >= 1) sc.typescript += sc.javascript; // TS also looks like JS
  let best = 'plain', top = 2;
  for (const k of Object.keys(sc)) if (sc[k] > top) { top = sc[k]; best = k; }
  return best;
}

/* ------------------------------------------------------------------ tokenizer (line based, tiny state) */
// A token is [class, text]. Classes: k keyword, s string, n number/literal, c comment, f function, a attribute/key,
// t type/tag, p punctuation-ish, i inserted, d deleted, '' plain. State is a short string carried between lines.
const set = (s) => new Set(s.split(' '));
const KW_JS = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await from as get set';
const SPECS = {
  json: { q: ['"'], keys: true, kw: set(''), lit: set('true false null') },
  javascript: { kw: set(KW_JS), lit: set('true false null undefined NaN Infinity'), line: ['//'], block: [['/*', '*/']], q: ['"', "'", '`'], multi: ['`'] },
  typescript: { kw: set(KW_JS + ' interface type enum implements public private protected readonly abstract namespace declare keyof unknown never any string number boolean'), lit: set('true false null undefined NaN Infinity'), line: ['//'], block: [['/*', '*/']], q: ['"', "'", '`'], multi: ['`'] },
  python: { kw: set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self cls'), lit: set('True False None'), line: ['#'], q: ['"', "'"], triple: ['"""', "'''"], at: true, defs: set('def class') },
  shell: { kw: set('if then else elif fi for while until do done case esac in function return exit export local readonly source alias unset set shift trap cd echo printf read test eval exec sudo'), lit: set('true false'), line: ['#'], wordHash: true, q: ['"', "'", '`'], dollar: true, flags: true },
  sql: { ci: true, kw: set('select from where and or not insert into values update set delete create table alter drop index view join left right inner outer full cross on as group by order having limit offset union all distinct case when then else end null is in exists between like ilike primary key foreign references default unique check constraint with returning asc desc count sum avg min max begin commit rollback if'), lit: set('null true false'), line: ['--'], block: [['/*', '*/']], q: ["'", '"', '`'] },
  yaml: { kw: set(''), lit: set('true false null yes no on off True False Null ~'), line: ['#'], wordHash: true, q: ['"', "'"] },
  c: { kw: set('auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename public private protected virtual override new delete using this try catch throw bool string var readonly foreach in is as out ref'), lit: set('true false NULL nullptr null'), line: ['//'], block: [['/*', '*/']], q: ['"', "'"], pre: true },
  java: { kw: set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var val fun when object companion override data sealed lateinit suspend let func struct protocol extension guard'), lit: set('true false null nil'), line: ['//'], block: [['/*', '*/']], q: ['"', "'"], triple: ['"""'], at: true },
  go: { kw: set('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'), lit: set('true false nil iota'), line: ['//'], block: [['/*', '*/']], q: ['"', "'", '`'], multi: ['`'], defs: set('func type') },
  rust: { kw: set('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while'), lit: set('true false None Some Ok Err'), line: ['//'], block: [['/*', '*/']], q: ['"', "'"], defs: set('fn struct enum trait') },
  php: { ci: true, kw: set('abstract and array as break case catch class clone const continue declare default do echo else elseif empty extends final finally for foreach function global if implements include include_once instanceof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while yield'), lit: set('true false null'), line: ['//', '#'], block: [['/*', '*/']], q: ['"', "'"], dollar: true },
  ruby: { kw: set('alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield puts require require_relative attr_accessor attr_reader'), lit: set('true false nil'), line: ['#'], q: ['"', "'"], defs: set('def class module') },
};
const IDENT = /[A-Za-z_$][\w$]*/y;
const NUM = /(0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?|\.\d+)[a-zA-Z%]*/y;
const MAX_TOKENIZE = 2000; // longer lines stay plain (minified blobs must stay smooth)

function readString(line, start, delim, esc) {
  let j = start;
  const n = line.length;
  while (j < n) {
    if (esc && line[j] === '\\') { j += 2; continue; }
    if (line.startsWith(delim, j)) return { end: j + delim.length, closed: true };
    j++;
  }
  return { end: n, closed: false };
}
const pusher = (out) => (c, t) => { if (!t) return; const l = out[out.length - 1]; if (l && l[0] === c) l[1] += t; else out.push([c, t]); };

function scanCode(spec, line, st) {
  const out = []; const push = pusher(out);
  const n = line.length; let i = 0; let prevWord = '';
  if (st) {
    const kind = st[0], arg = st.slice(2);
    if (kind === 'b') {
      const j = line.indexOf(arg);
      if (j < 0) { push('c', line); return { t: out, s: st }; }
      push('c', line.slice(0, j + arg.length)); i = j + arg.length;
    } else if (kind === 's') {
      const r = readString(line, 0, arg, true);
      push('s', line.slice(0, r.end));
      if (!r.closed) return { t: out, s: st };
      i = r.end;
    }
  }
  outer: while (i < n) {
    const c = line[i];
    if (c === ' ' || c === '\t') { let j = i; while (j < n && (line[j] === ' ' || line[j] === '\t')) j++; push('', line.slice(i, j)); i = j; continue; }
    if (spec.line) for (const lc of spec.line) {
      if (line.startsWith(lc, i) && !(spec.wordHash && lc === '#' && i > 0 && !/\s/.test(line[i - 1]))) { push('c', line.slice(i)); i = n; break outer; }
    }
    if (spec.pre && c === '#' && /^\s*$/.test(line.slice(0, i))) { push('k', line.slice(i)); i = n; break; }
    if (spec.block) for (const [o, cl] of spec.block) {
      if (line.startsWith(o, i)) {
        const j = line.indexOf(cl, i + o.length);
        if (j < 0) { push('c', line.slice(i)); return { t: out, s: 'b:' + cl }; }
        push('c', line.slice(i, j + cl.length)); i = j + cl.length; continue outer;
      }
    }
    if (spec.triple) for (const d of spec.triple) {
      if (line.startsWith(d, i)) {
        const r = readString(line, i + d.length, d, true);
        push('s', line.slice(i, r.end)); i = r.end;
        if (!r.closed) return { t: out, s: 's:' + d };
        continue outer;
      }
    }
    if (spec.q.includes(c)) {
      const r = readString(line, i + 1, c, true);
      if (!r.closed && spec.multi && spec.multi.includes(c)) { push('s', line.slice(i)); return { t: out, s: 's:' + c }; }
      let cls = 's';
      if (spec.keys && r.closed && /^\s*:/.test(line.slice(r.end, r.end + 40))) cls = 'a';
      push(cls, line.slice(i, r.end)); i = r.end; prevWord = ''; continue;
    }
    if (spec.dollar && c === '$') {
      const m = /^\$(\{[^}]*\}|[A-Za-z_]\w*|[0-9@#?!*$-])/.exec(line.slice(i, i + 80));
      if (m) { push('a', m[0]); i += m[0].length; continue; }
    }
    if (spec.at && c === '@') {
      const m = /^@[A-Za-z_][\w.]*/.exec(line.slice(i, i + 80));
      if (m) { push('f', m[0]); i += m[0].length; continue; }
    }
    if (spec.flags && c === '-' && (i === 0 || /\s/.test(line[i - 1]))) {
      const m = /^--?[A-Za-z][\w-]*/.exec(line.slice(i, i + 80));
      if (m) { push('t', m[0]); i += m[0].length; continue; }
    }
    if ((c >= '0' && c <= '9') || (c === '.' && line[i + 1] >= '0' && line[i + 1] <= '9')) {
      if (i > 0 && /[\w$]/.test(line[i - 1])) { push('', c); i++; continue; }
      NUM.lastIndex = i;
      const m = NUM.exec(line);
      if (m) { push('n', m[0]); i += m[0].length; continue; }
    }
    IDENT.lastIndex = i;
    const m = c === '$' || /[A-Za-z_]/.test(c) ? IDENT.exec(line) : null;
    if (m) {
      const w = m[0]; const key = spec.ci ? w.toLowerCase() : w;
      let cls = '';
      if (spec.lit.has(key)) cls = 'n';
      else if (spec.kw.has(key)) cls = 'k';
      else if (prevWord === 'new' && /^[A-Za-z_]/.test(w)) cls = 't';
      else if (spec.defs && spec.defs.has(prevWord)) cls = prevWord === 'class' || prevWord === 'struct' || prevWord === 'enum' || prevWord === 'trait' || prevWord === 'type' ? 't' : 'f';
      else if (/^\s*\(/.test(line.slice(i + w.length, i + w.length + 12))) cls = 'f';
      else if (/^[A-Z][A-Za-z0-9_]+$/.test(w) && !spec.ci) cls = 't';
      push(cls, w); i += w.length; prevWord = key; continue;
    }
    push('', c); i++;
  }
  return { t: out, s: '' };
}

function scanHtml(line, st) {
  const out = []; const push = pusher(out);
  let i = 0; const n = line.length;
  if (st === 'cm') {
    const j = line.indexOf('-->');
    if (j < 0) { push('c', line); return { t: out, s: 'cm' }; }
    push('c', line.slice(0, j + 3)); i = j + 3; st = '';
  }
  let inTag = st === 'tg';
  while (i < n) {
    if (!inTag) {
      const j = line.indexOf('<', i);
      if (j < 0) { push('', line.slice(i)); break; }
      push('', line.slice(i, j)); i = j;
      if (line.startsWith('<!--', i)) {
        const e = line.indexOf('-->', i + 4);
        if (e < 0) { push('c', line.slice(i)); return { t: out, s: 'cm' }; }
        push('c', line.slice(i, e + 3)); i = e + 3; continue;
      }
      const m = /^<[!?/]?[A-Za-z][\w:.-]*|^<![A-Za-z]+/.exec(line.slice(i, i + 80));
      if (m) { push('t', m[0]); i += m[0].length; inTag = true; continue; }
      push('', '<'); i++; continue;
    }
    const c = line[i];
    if (c === '>' || (c === '/' && line[i + 1] === '>') || (c === '?' && line[i + 1] === '>')) { const l = c === '>' ? 1 : 2; push('t', line.slice(i, i + l)); i += l; inTag = false; continue; }
    if (c === '"' || c === "'") { const r = readString(line, i + 1, c, false); push('s', line.slice(i, r.end)); i = r.end; continue; }
    if (c === ' ' || c === '\t' || c === '=') { push('', c); i++; continue; }
    const m = /^[^\s=>/"']+/.exec(line.slice(i, i + 120));
    if (m) { push('a', m[0]); i += m[0].length; continue; }
    push('', c); i++;
  }
  return { t: out, s: inTag ? 'tg' : '' };
}

function scanCss(line, st) {
  const out = []; const push = pusher(out);
  let i = 0; const n = line.length;
  if (st === 'cb') {
    const j = line.indexOf('*/');
    if (j < 0) { push('c', line); return { t: out, s: 'cb' }; }
    push('c', line.slice(0, j + 2)); i = j + 2;
  }
  const selectorLine = line.indexOf('{', i) > -1 && !/^\s*[\w-]+\s*:\s*[^{]*;\s*\}?\s*$/.test(line);
  while (i < n) {
    const c = line[i];
    if (c === '/' && line[i + 1] === '*') {
      const j = line.indexOf('*/', i + 2);
      if (j < 0) { push('c', line.slice(i)); return { t: out, s: 'cb' }; }
      push('c', line.slice(i, j + 2)); i = j + 2; continue;
    }
    if (c === '"' || c === "'") { const r = readString(line, i + 1, c, true); push('s', line.slice(i, r.end)); i = r.end; continue; }
    if (c === '@') { const m = /^@[\w-]+/.exec(line.slice(i, i + 60)); if (m) { push('k', m[0]); i += m[0].length; continue; } }
    if (c === '#') {
      const m = /^#[0-9a-fA-F]{3,8}\b/.exec(line.slice(i, i + 12));
      if (m && !selectorLine) { push('n', m[0]); i += m[0].length; continue; }
      const id = /^#[\w-]+/.exec(line.slice(i, i + 80));
      if (id) { push('t', id[0]); i += id[0].length; continue; }
    }
    if (c === '.' && selectorLine && /[A-Za-z_-]/.test(line[i + 1] || '')) { const m = /^\.[\w-]+/.exec(line.slice(i, i + 80)); push('t', m[0]); i += m[0].length; continue; }
    if ((c >= '0' && c <= '9') || (c === '.' && line[i + 1] >= '0' && line[i + 1] <= '9') || (c === '-' && line[i + 1] >= '0' && line[i + 1] <= '9' && !/[\w-]/.test(line[i - 1] || ' '))) {
      const m = /^-?(\d+\.?\d*|\.\d+)([a-zA-Z%]*)/.exec(line.slice(i, i + 40));
      if (m) { push('n', m[0]); i += m[0].length; continue; }
    }
    if (/[A-Za-z_-]/.test(c)) {
      const m = /^[A-Za-z_-][\w-]*/.exec(line.slice(i, i + 120));
      const w = m[0]; const after = line.slice(i + w.length);
      let cls = '';
      if (/^\(/.test(after)) cls = 'f';
      else if (selectorLine) cls = /^:/.test(line.slice(i - 1, i)) ? 'k' : 't';
      else if (/^\s*:/.test(after) && /^[\s;{]*$/.test(line.slice(0, i))) cls = 'a';
      else if (/^\s*:/.test(after) && /[;{]\s*$/.test(line.slice(0, i))) cls = 'a';
      push(cls, w); i += w.length; continue;
    }
    push('', c); i++;
  }
  return { t: out, s: '' };
}

// Older Safari cannot parse lookbehind; fall back to simpler italics there instead of breaking the whole page.
let LB = true; try { new RegExp('(?<!a)b'); } catch { LB = false; }
const MD_INLINE = new RegExp('`[^`\\n]+`|\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__|~~[^~\\n]+~~|\\[[^\\]\\n]*\\]\\([^)\\n]*\\)|<https?:[^>\\s]+>|https?:\\/\\/[^\\s)<]+|' + (LB ? '(?<![\\w*])\\*[^*\\s][^*\\n]*\\*(?![\\w*])' : '\\*[^*\\s][^*\\n]*\\*'), 'g');
function mdInline(text, push) {
  let last = 0; MD_INLINE.lastIndex = 0;
  for (let m = MD_INLINE.exec(text); m; m = MD_INLINE.exec(text)) {
    push('', text.slice(last, m.index));
    const t = m[0];
    if (t[0] === '`') push('s', t);
    else if (t.startsWith('**') || t.startsWith('__')) push('f', t);
    else if (t[0] === '~') push('c', t);
    else if (t[0] === '[') { const k = t.indexOf(']('); push('a', t.slice(0, k + 1)); push('c', t.slice(k + 1)); }
    else if (t[0] === '*') push('t', t);
    else push('a', t);
    last = m.index + t.length;
  }
  push('', text.slice(last));
}
function scanMarkdown(line, st) {
  const out = []; const push = pusher(out);
  if (st && st[0] === 'f') {
    const fence = st.slice(2);
    if (line.trim().startsWith(fence)) { push('p', line); return { t: out, s: '' }; }
    push('s', line); return { t: out, s: st };
  }
  const fm = /^\s*(```+|~~~+)/.exec(line);
  if (fm) { push('p', line); return { t: out, s: 'f:' + fm[1] }; }
  if (/^\s{0,3}#{1,6}(\s|$)/.test(line)) { push('k', line); return { t: out, s: '' }; }
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { push('p', line); return { t: out, s: '' }; }
  let rest = line;
  const bq = /^\s*(>\s?)+/.exec(rest);
  if (bq) { push('c', bq[0]); rest = rest.slice(bq[0].length); }
  const li = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\])?/.exec(rest);
  if (li) {
    push('', li[1]); push('p', li[2]); push('', li[3]);
    if (li[4]) push(/[xX]/.test(li[4]) ? 'i' : 'n', li[4]);
    rest = rest.slice(li[0].length);
  }
  mdInline(rest, push);
  return { t: out, s: '' };
}
function scanDiff(line) {
  const c = line[0];
  const cls = /^(\+\+\+|---) /.test(line) || /^(diff |index |new file|deleted file)/.test(line) ? 'c' : c === '+' ? 'i' : c === '-' ? 'd' : c === '@' ? 'k' : '';
  return { t: line ? [[cls, line]] : [], s: '' };
}
const LOG_RE = /\b\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?\b|\b\d\d:\d\d:\d\d(?:[.,]\d+)?\b|\b(?:ERROR|FATAL|SEVERE|CRITICAL|Exception)\b|\bWARN(?:ING)?\b|\bINFO\b|\b(?:DEBUG|TRACE)\b|"[^"\n]*"|\[[^\]\n]{1,40}\]/g;
function scanLog(line) {
  const out = []; const push = pusher(out); let last = 0; LOG_RE.lastIndex = 0;
  for (let m = LOG_RE.exec(line); m; m = LOG_RE.exec(line)) {
    push('', line.slice(last, m.index));
    const t = m[0];
    push(/^(ERROR|FATAL|SEVERE|CRITICAL|Exception)$/.test(t) ? 'd' : /^WARN/.test(t) ? 'n' : t === 'INFO' ? 'a' : /^(DEBUG|TRACE)$/.test(t) ? 'c' : t[0] === '"' ? 's' : t[0] === '[' ? 'p' : 'c', t);
    last = m.index + t.length;
  }
  push('', line.slice(last));
  return { t: out, s: '' };
}
const YAML_KEY = /^(\s*(?:-\s+)*)("[^"]*"|'[^']*'|[^\s#:'"-][^:#]*?)(\s*:)(?=\s|$)/;
function scanYaml(line, st) {
  const m = YAML_KEY.exec(line);
  const spec = SPECS.yaml;
  if (!m || st) return scanCode(spec, line, st);
  const out = []; const push = pusher(out);
  push('', m[1].replace(/-\s+/g, (x) => x)); // keep indentation + dashes
  push('a', m[2]); push('p', m[3]);
  const r = scanCode(spec, line.slice(m[0].length), '');
  for (const [c, t] of r.t) push(c, t);
  return { t: out, s: r.s };
}

/** @returns {{t:Array<[string,string]>, s:string}} tokens for one line + state for the next line */
export function tokenizeLine(lang, line, state = '') {
  if (!line) return { t: [], s: state };
  if (lang === 'plain' || line.length > MAX_TOKENIZE) return { t: [['', line]], s: state };
  switch (lang) {
    case 'html': case 'xml': return scanHtml(line, state);
    case 'css': return scanCss(line, state);
    case 'markdown': return scanMarkdown(line, state);
    case 'diff': return scanDiff(line);
    case 'log': return scanLog(line);
    case 'yaml': return scanYaml(line, state);
    default: return SPECS[lang] ? scanCode(SPECS[lang], line, state) : { t: [['', line]], s: '' };
  }
}
export function lineHtml(tokens) {
  let h = '';
  for (const [c, t] of tokens) h += c ? `<span class="t-${c}">${esc(t)}</span>` : esc(t);
  return h;
}

/* ------------------------------------------------------------------ line diff (Myers, capped) */
function myers(A, B, maxD = 1500) {
  const N = A.length, M = B.length;
  if (!N || !M) return [...A.map((x) => ['-', x]), ...B.map((x) => ['+', x])];
  const max = Math.min(N + M, maxD), off = max + 1;
  let V = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(V.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      V[off + k] = x;
      if (x >= N && y >= M) { found = d; break; }
    }
  }
  if (found < 0) return [...A.map((x) => ['-', x]), ...B.map((x) => ['+', x])]; // too different: coarse
  const ops = [];
  let x = N, y = M;
  for (let d = found; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const pk = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? k + 1 : k - 1;
    const px = v[off + pk], py = px - pk;
    while (x > px && y > py) { ops.push(['=', A[x - 1]]); x--; y--; }
    if (x === px) ops.push(['+', B[py]]); else ops.push(['-', A[px]]);
    x = px; y = py;
  }
  while (x > 0 && y > 0) { ops.push(['=', A[x - 1]]); x--; y--; }
  return ops.reverse();
}
/** @returns {Array<{op:'='|'-'|'+', text:string}>} */
export function diffLines(aText, bText) {
  const a = String(aText).split('\n'), b = String(bText).split('\n');
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const mid = myers(a.slice(s, ea), b.slice(s, eb));
  return [
    ...a.slice(0, s).map((text) => ({ op: '=', text })),
    ...mid.map(([op, text]) => ({ op, text })),
    ...a.slice(ea).map((text) => ({ op: '=', text })),
  ];
}
/** Collapse long unchanged runs: returns rows {op, text} and {op:'skip', n}. */
export function diffRows(ops, context = 2) {
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, i) => { if (o.op !== '=') for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) keep[j] = true; });
  const rows = []; let skipped = 0;
  ops.forEach((o, i) => {
    if (keep[i]) { if (skipped) { rows.push({ op: 'skip', n: skipped }); skipped = 0; } rows.push(o); } else skipped++;
  });
  if (skipped) rows.push({ op: 'skip', n: skipped });
  return rows;
}
export const diffStats = (ops) => ({ added: ops.filter((o) => o.op === '+').length, removed: ops.filter((o) => o.op === '-').length });

/* ------------------------------------------------------------------ checklists  ("- [ ] item") */
const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?=\s|$)/;
export function checklistItems(text) {
  const out = [];
  String(text).split('\n').forEach((l, i) => { const m = TASK.exec(l); if (m) out.push({ line: i, checked: m[2] !== ' ', text: l.slice(m[0].length).trim() }); });
  return out;
}
export function checklistStats(text) {
  const it = checklistItems(text);
  return { done: it.filter((x) => x.checked).length, total: it.length };
}
/** Flip the box on line `lineIdx` (0-based). Returns new text, or null when that line has no box. */
export function toggleChecklistLine(text, lineIdx) {
  const lines = String(text).split('\n');
  const m = lineIdx >= 0 && lineIdx < lines.length ? TASK.exec(lines[lineIdx]) : null;
  if (!m) return null;
  lines[lineIdx] = m[1] + '[' + (m[2] === ' ' ? 'x' : ' ') + ']' + lines[lineIdx].slice(m[0].length);
  return lines.join('\n');
}
/** If character offset `pos` touches a "[ ]" / "[x]" box, flip it. Returns new text or null. */
export function toggleChecklistAt(text, pos) {
  const t = String(text);
  const ls = t.lastIndexOf('\n', pos - 1) + 1;
  let le = t.indexOf('\n', pos); if (le < 0) le = t.length;
  const m = TASK.exec(t.slice(ls, le));
  if (!m) return null;
  const boxStart = ls + m[1].length; // the "["
  if (pos < boxStart || pos > boxStart + 3) return null;
  return t.slice(0, boxStart + 1) + (m[2] === ' ' ? 'x' : ' ') + t.slice(boxStart + 2);
}

/* ------------------------------------------------------------------ Enter key: keep indent, continue lists */
/** @returns {null|{from:number,to:number,text:string}}  replace [from,to) with text, caret goes to the end of it */
export function enterEdit(text, pos) {
  const t = String(text);
  const ls = t.lastIndexOf('\n', pos - 1) + 1;
  let le = t.indexOf('\n', pos); if (le < 0) le = t.length;
  const before = t.slice(ls, pos), line = t.slice(ls, le);
  const lm = /^(\s*)((?:[-*+] \[[ xX]\] )|(?:[-*+] )|(?:(\d+)([.)]) ))(.*)$/.exec(line);
  if (lm && pos === le) {
    if (!lm[5].trim()) return { from: ls, to: le, text: '' };                       // empty item: end the list
    const marker = lm[3] !== undefined ? `${+lm[3] + 1}${lm[4]} ` : lm[2].replace(/\[[xX]\]/, '[ ]');
    return { from: pos, to: pos, text: '\n' + lm[1] + marker };
  }
  const indent = /^[ \t]*/.exec(line)[0].slice(0, before.length);
  const extra = /[{[(:]\s*$/.test(before) ? '  ' : '';
  if (!indent && !extra) return null;
  return { from: pos, to: pos, text: '\n' + indent + extra };
}

/* ------------------------------------------------------------------ safe markdown -> HTML */
const SAFE_URL = /^(https?:\/\/|mailto:|#|\/(?!\/))/i;
const ALIAS = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell', yml: 'yaml', md: 'markdown', htm: 'html', rs: 'rust', rb: 'ruby', 'c++': 'c', cpp: 'c', cs: 'c', kt: 'java' };
const INL = new RegExp('\\[([^\\]]+)\\]\\(([^)\\s]+)\\)|\\*\\*(.+?)\\*\\*|__(.+?)__|~~(.+?)~~|' +
  (LB ? '(?<![*\\w])\\*(?![\\s*])(.+?)(?<![\\s*])\\*(?![*\\w])|(?<!\\w)_(?![\\s_])(.+?)(?<![\\s_])_(?!\\w)' : '\\*(?![\\s*])([^*]+?)\\*|(?:_)(?![\\s_])([^_]+?)_(?!\\w)') +
  '|(https?:\\/\\/[^\\s<)\\]]+)', 'g');
function inlineSeg(s, auto = true) { // s is ALREADY escaped
  return s.replace(INL, (m, lt, lu, b1, b2, st, i1, i2, au) => {
    if (lt !== undefined) return SAFE_URL.test(lu) ? `<a href="${lu}" target="_blank" rel="noopener noreferrer nofollow">${inlineSeg(lt, false)}</a>` : m;
    if (b1 !== undefined || b2 !== undefined) return `<strong>${inlineSeg(b1 ?? b2, auto)}</strong>`;
    if (st !== undefined) return `<del>${inlineSeg(st, auto)}</del>`;
    if (i1 !== undefined || i2 !== undefined) return `<em>${inlineSeg(i1 ?? i2, auto)}</em>`;
    if (au !== undefined && auto) { const mm = /[.,;:!?]+$/.exec(au); const url = mm ? au.slice(0, -mm[0].length) : au; return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${mm ? mm[0] : ''}`; }
    return m;
  });
}
export function mdInlineHtml(raw) {
  // code spans first (their content is never touched), everything else escaped then formatted
  const parts = String(raw).split(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/);
  let h = '';
  for (let i = 0; i < parts.length; i += 3) {
    h += inlineSeg(esc(parts[i]));
    if (i + 2 < parts.length) h += `<code>${esc(parts[i + 2])}</code>`;
  }
  return h;
}
const BLOCK_START = /^\s*(```|~~~|#{1,6}\s|>|([-*+]|\d+[.)])\s|([-*_])(\s*\3){2,}\s*$)/;
export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  return mdBlocks(lines, 0, lines.length);
}
function codeBlock(codeLines, lang) {
  const id = ALIAS[lang] || lang;
  let st = '', h = '';
  for (const l of codeLines) {
    const r = SPECS[id] || ['html', 'xml', 'css', 'yaml', 'diff', 'log', 'markdown'].includes(id) ? tokenizeLine(id, l, st) : { t: [['', l]], s: '' };
    st = r.s; h += lineHtml(r.t) + '\n';
  }
  return `<pre class="md-code"><code>${h}</code></pre>`;
}
function mdBlocks(lines, from, to, base = 0) {
  let out = '', i = from;
  while (i < to) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fm = /^\s*(```+|~~~+)\s*([\w+#-]*)/.exec(line);
    if (fm) {
      const code = []; i++;
      while (i < to && !lines[i].trim().startsWith(fm[1])) code.push(lines[i++]);
      i++; out += codeBlock(code, fm[2].toLowerCase()); continue;
    }
    const hm = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (hm) { out += `<h${hm[1].length}>${mdInlineHtml(hm[2])}</h${hm[1].length}>`; i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out += '<hr>'; i++; continue; }
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < to && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out += `<blockquote>${mdBlocks(q, 0, q.length)}</blockquote>`; continue;
    }
    if (/\|/.test(line) && i + 1 < to && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(line); i += 2;
      let body = '';
      while (i < to && lines[i].trim() && /\|/.test(lines[i])) { body += '<tr>' + cells(lines[i]).map((c) => `<td>${mdInlineHtml(c)}</td>`).join('') + '</tr>'; i++; }
      out += `<div class="md-tablewrap"><table><thead><tr>${head.map((c) => `<th>${mdInlineHtml(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
      continue;
    }
    const lm = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line);
    if (lm) {
      const r = mdList(lines, i, to, base);
      out += r.html; i = r.next; continue;
    }
    const para = [];
    while (i < to && lines[i].trim() && !(para.length && BLOCK_START.test(lines[i]))) para.push(lines[i++]);
    out += `<p>${para.map(mdInlineHtml).join('<br>')}</p>`;
  }
  return out;
}
function mdList(lines, i, to, base) {
  const first = /^(\s*)([-*+]|\d+[.)])\s+/.exec(lines[i]);
  const indent = first[1].length, ordered = /\d/.test(first[2]);
  let html = '';
  while (i < to) {
    const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
    if (!m || m[1].length < indent) break;
    if (m[1].length > indent) { // nested list: belongs to the previous item
      const r = mdList(lines, i, to, base);
      html = html.replace(/<\/li>$/, r.html + '</li>'); i = r.next; continue;
    }
    const task = /^\[( |x|X)\](?:\s+(.*))?$/.exec(m[3]);
    if (task) {
      html += `<li class="task${task[1] !== ' ' ? ' done' : ''}" data-line="${i + base}"><input type="checkbox" tabindex="-1" aria-label="Toggle item"${task[1] !== ' ' ? ' checked' : ''}><span>${mdInlineHtml(task[2] || '')}</span></li>`;
    } else html += `<li>${mdInlineHtml(m[3])}</li>`;
    i++;
  }
  const tasky = /class="task/.test(html) ? ' class="tasks"' : '';
  return { html: `<${ordered ? 'ol' : 'ul'}${tasky}>${html}</${ordered ? 'ol' : 'ul'}>`, next: i };
}

/* ------------------------------------------------------------------ small helpers */
export function relTime(iso, now = Date.now()) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
  const d = Math.round(h / 24); if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
/** "29 days left", "5 h left", "Kept" (no expiry), "Expired" */
export function timeLeft(iso, now = Date.now()) {
  if (!iso) return 'Kept';
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'Expired';
  const m = Math.round(ms / 60000); if (m < 60) return Math.max(1, m) + ' min left';
  const h = Math.round(m / 60); if (h < 48) return h + ' h left';
  return Math.round(h / 24) + ' days left';
}
export function fmtBytes(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
export const byteLen = (s) => new TextEncoder().encode(s).length;
export function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'note'; }
/** A title for a note: its own title, else the first non-empty line without markdown marks. */
export function deriveTitle(title, text) {
  const t = String(title || '').trim();
  if (t) return t;
  for (const l of String(text || '').split('\n', 40)) {
    const x = l.replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, '').trim();
    if (x) return x.slice(0, 80);
  }
  return '';
}
