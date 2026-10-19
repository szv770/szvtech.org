// Smart paste: guess what a pasted string is and which tool should open it. Pure.
import { looksLikeJwt } from './jwt.js?v=df4c61d9fa';
import { looksLikeBase64 } from './encode.js?v=5328626cab';
import { looksLikeTimestamp } from './time.js?v=f950873b81';
import { validate } from './json.js?v=fe024d3717';
import { inspectId } from './ids.js?v=abe9a27f12';
import { looksLikeCron } from './cron.js?v=b3d7894f4a';
import { looksLikeColor } from './color.js?v=a4e78c5a3d';

/** detect(text) -> [{ tool, label, why }] best first */
export function detect(input) {
  const raw = String(input);
  const t = raw.trim();
  if (!t) return [];
  const out = [];
  const add = (tool, label, why) => { if (!out.some((o) => o.tool === tool)) out.push({ tool, label, why }); };

  if (looksLikeJwt(t)) add('jwt', 'JWT', 'Three base64url parts with a JSON header');
  const id = t.length < 60 ? inspectId(t) : null;
  if (id) add('ids', id.label, id.time != null ? 'Has a timestamp inside' : 'Identifier');
  if (/^[[{]/.test(t)) {
    const v = validate(t);
    add('json', 'JSON', v.ok ? 'Valid JSON' : `JSON with an error on line ${v.error.line}`);
  }
  if (looksLikeTimestamp(t)) add('time', 'Unix timestamp', 'A number that reads as a date');
  else if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(t)) add('time', 'Date / time', 'ISO 8601');
  if (looksLikeCron(t)) add('cron', 'Cron expression', 'Five or six schedule fields');
  if (looksLikeColor(t)) add('color', 'Color', 'Hex or CSS color');
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(t)) add('url', 'URL', /[?#]/.test(t) ? 'Has a query string to unpack' : 'Link');
  else if (/%[0-9a-f]{2}/i.test(t) && !/\s/.test(t)) add('url', 'URL-encoded text', 'Contains %XX escapes');
  else if (/^[\w.~-]+=[^&]*(&[\w.~-]+=[^&]*)+$/.test(t)) add('url', 'Query string', 'key=value&…');
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t)) add('html', 'HTML entities', 'Contains &…; escapes');
  if (/^(0x[0-9a-f]+|0b[01]+|0o[0-7]+)$/i.test(t)) add('base', 'Number', 'Prefixed number');
  if (/^data:[\w/+.-]*(;[\w=.-]+)*;base64,/i.test(t)) add('base64', 'Data URL', 'Base64 inside a data: URL');
  else if (!out.length && looksLikeBase64(t)) add('base64', 'Base64', 'Decodes to readable text');
  if (/^[0-9a-f]{32}$/i.test(t) || /^[0-9a-f]{40}$/i.test(t) || /^[0-9a-f]{64}$/i.test(t) || /^[0-9a-f]{96}$/i.test(t) || /^[0-9a-f]{128}$/i.test(t)) {
    const n = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' }[t.length];
    add('hash', `Looks like ${n}`, 'Compare it against a file or text');
  }
  if (/^\/.+\/[dgimsuyv]*$/.test(t)) add('regex', 'Regular expression', '/pattern/flags');
  if (/^\d+$/.test(t)) add('base', 'Number', 'Convert between bases');
  if (raw.includes('\n') && /^(---|\w[\w -]*:\s)/m.test(t) && !/^[[{]/.test(t)) add('yaml', 'YAML', 'key: value lines');
  if (!out.length && /\S/.test(t)) {
    if (/^[A-Za-z][A-Za-z0-9]*([_-][A-Za-z0-9]+)+$|^[a-z]+([A-Z][a-z0-9]+)+$/.test(t)) add('case', 'Identifier', 'Change its case');
    else { add('hash', 'Text', 'Hash it'); add('base64', 'Text', 'Encode it'); add('case', 'Text', 'Change its case'); }
  }
  return out;
}
