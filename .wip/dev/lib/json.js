// Strict JSON validation with precise error positions, formatting helpers and tree paths. Pure.

export function lineCol(text, index) {
  let line = 1, col = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { line++; col = 1; } else col++;
  }
  return { line, col };
}

class JErr extends Error { constructor(msg, pos) { super(msg); this.pos = pos; } }

/**
 * Validate strict JSON (RFC 8259). Returns { ok:true, warnings:[{msg,pos,line,col}], stats }
 * or { ok:false, error:{ msg, pos, line, col } }.
 */
export function validate(text) {
  const s = String(text);
  let i = 0;
  const warnings = [];
  const stats = { objects: 0, arrays: 0, keys: 0, strings: 0, numbers: 0, depth: 0 };
  const ch = () => s[i];
  const desc = (c) => c === undefined ? 'end of input' : c === '\n' ? 'line break' : `'${c}'`;
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++; };
  const fail = (msg, pos = i) => { throw new JErr(msg, pos); };

  function value(depth) {
    ws();
    if (depth > stats.depth) stats.depth = depth;
    if (depth > 5000) fail('Nesting too deep');
    const c = ch();
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') { string(); stats.strings++; return; }
    if (c === '-' || (c >= '0' && c <= '9')) { number(); stats.numbers++; return; }
    for (const lit of ['true', 'false', 'null']) {
      if (s.startsWith(lit, i)) { i += lit.length; return; }
    }
    if (c === undefined) fail('Unexpected end of input — expected a value');
    if (c === "'") fail('Strings must use double quotes');
    if (c === '}' || c === ']') fail(`Unexpected ${desc(c)} — expected a value`);
    if (s.startsWith('undefined', i) || s.startsWith('NaN', i) || s.startsWith('Infinity', i)) fail('Not valid in JSON (use null or a number)');
    if (s.startsWith('//', i) || s.startsWith('/*', i)) fail('Comments are not allowed in JSON');
    fail(`Unexpected ${desc(c)} — expected a value`);
  }
  function object(depth) {
    stats.objects++;
    i++; ws();
    const seen = new Set();
    if (ch() === '}') { i++; return; }
    for (;;) {
      ws();
      if (ch() !== '"') {
        if (ch() === '}') fail('Trailing comma before }', lastComma);
        if (ch() === "'") fail('Property names must use double quotes');
        if (/[A-Za-z_$]/.test(ch() || '')) fail('Property names must be in double quotes');
        fail(`Unexpected ${desc(ch())} — expected a property name`);
      }
      const kpos = i;
      const key = string();
      stats.keys++;
      if (seen.has(key)) warnings.push({ msg: `Duplicate key "${key}" (last one wins)`, pos: kpos });
      seen.add(key);
      ws();
      if (ch() !== ':') fail(`Expected ':' after property name, got ${desc(ch())}`);
      i++;
      value(depth + 1);
      ws();
      if (ch() === ',') { var lastComma = i; i++; continue; }
      if (ch() === '}') { i++; return; }
      fail(`Expected ',' or '}' after property value, got ${desc(ch())}`);
    }
  }
  function array(depth) {
    stats.arrays++;
    i++; ws();
    if (ch() === ']') { i++; return; }
    let lastComma = -1;
    for (;;) {
      ws();
      if (ch() === ']' && lastComma >= 0) fail('Trailing comma before ]', lastComma);
      value(depth + 1);
      ws();
      if (ch() === ',') { lastComma = i; i++; continue; }
      if (ch() === ']') { i++; return; }
      fail(`Expected ',' or ']' after array item, got ${desc(ch())}`);
    }
  }
  function string() {
    const start = i;
    i++;
    let out = '';
    for (;;) {
      const c = s[i];
      if (c === undefined) fail('Unterminated string', start);
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        const e = s[i + 1];
        if (e === 'u') {
          const hex = s.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Bad \\u escape (needs 4 hex digits)');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6; continue;
        }
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (!(e in map)) fail(`Bad escape \\${e === undefined ? '' : e}`);
        out += map[e]; i += 2; continue;
      }
      if (c.charCodeAt(0) < 0x20) fail(c === '\n' ? 'Line break inside string (use \\n)' : 'Control character inside string');
      out += c; i++;
    }
  }
  function number() {
    const start = i;
    if (s[i] === '-') i++;
    if (s[i] === '0') { i++; if (s[i] >= '0' && s[i] <= '9') fail('Leading zeros are not allowed', start); }
    else if (s[i] >= '1' && s[i] <= '9') { while (s[i] >= '0' && s[i] <= '9') i++; }
    else fail('Expected a digit');
    if (s[i] === '.') { i++; if (!(s[i] >= '0' && s[i] <= '9')) fail('Expected a digit after the decimal point'); while (s[i] >= '0' && s[i] <= '9') i++; }
    if (s[i] === 'e' || s[i] === 'E') {
      i++; if (s[i] === '+' || s[i] === '-') i++;
      if (!(s[i] >= '0' && s[i] <= '9')) fail('Expected a digit in the exponent');
      while (s[i] >= '0' && s[i] <= '9') i++;
    }
    const lit = s.slice(start, i);
    if (/^-?\d{16,}$/.test(lit) && !Number.isSafeInteger(Number(lit))) warnings.push({ msg: `Number ${lit} is too big for exact JavaScript precision`, pos: start });
  }

  try {
    ws();
    if (i >= s.length) throw new JErr('Empty input', 0);
    value(0);
    ws();
    if (i < s.length) fail(`Unexpected ${desc(ch())} after the end of the JSON value`);
  } catch (e) {
    if (!(e instanceof JErr)) throw e;
    return { ok: false, error: { msg: e.message, pos: e.pos, ...lineCol(s, e.pos) } };
  }
  return { ok: true, warnings: warnings.map((w) => ({ ...w, ...lineCol(s, w.pos) })), stats };
}

export function parse(text) {
  const v = validate(text);
  if (!v.ok) { const e = new Error(`${v.error.msg} (line ${v.error.line}, col ${v.error.col})`); e.info = v.error; throw e; }
  return JSON.parse(text);
}

export function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) Object.defineProperty(o, k, { value: sortKeysDeep(v[k]), enumerable: true, writable: true, configurable: true });
    return o;
  }
  return v;
}

export function format(text, { indent = 2, sortKeys = false } = {}) {
  let v = parse(text);
  if (sortKeys) v = sortKeysDeep(v);
  return JSON.stringify(v, null, indent === 'tab' ? '\t' : indent);
}
export const minify = (text) => JSON.stringify(parse(text));

/** JS-style path for a key sequence, e.g. ['a', 0, 'b-c'] -> $.a[0]["b-c"] */
export function pathOf(keys) {
  let p = '$';
  for (const k of keys) {
    if (typeof k === 'number') p += `[${k}]`;
    else if (/^[A-Za-z_$][\w$]*$/.test(k)) p += '.' + k;
    else p += '[' + JSON.stringify(k) + ']';
  }
  return p;
}

/** A small code frame around an error position: [{n, text, isErr}] + caret column */
export function codeFrame(text, line, ctx = 2) {
  const lines = String(text).split('\n');
  const from = Math.max(1, line - ctx), to = Math.min(lines.length, line + ctx);
  const out = [];
  for (let n = from; n <= to; n++) out.push({ n, text: lines[n - 1], isErr: n === line });
  return out;
}
