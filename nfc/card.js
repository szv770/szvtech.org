// /nfc — the digital card: fields <-> a compact string that lives in the URL hash.
// No DOM, no imports (runs in Node tests and on the viewer page).

export const THEMES = [
  { id: 'aurora', name: 'Aurora', c: ['#8b5cf6', '#e879f9', '#22d3ee'] },
  { id: 'ember', name: 'Ember', c: ['#f97316', '#f43f5e', '#fbbf24'] },
  { id: 'ocean', name: 'Ocean', c: ['#0ea5e9', '#6366f1', '#2dd4bf'] },
  { id: 'forest', name: 'Forest', c: ['#22c55e', '#14b8a6', '#a3e635'] },
  { id: 'rose', name: 'Rose', c: ['#ec4899', '#f472b6', '#fb7185'] },
  { id: 'mono', name: 'Mono', c: ['#e5e7eb', '#94a3b8', '#ffffff'] },
];

export const SOCIAL_KINDS = [
  { id: 'instagram', name: 'Instagram', base: 'https://instagram.com/' },
  { id: 'linkedin', name: 'LinkedIn', base: 'https://www.linkedin.com/in/' },
  { id: 'x', name: 'X', base: 'https://x.com/' },
  { id: 'facebook', name: 'Facebook', base: 'https://facebook.com/' },
  { id: 'tiktok', name: 'TikTok', base: 'https://www.tiktok.com/@' },
  { id: 'youtube', name: 'YouTube', base: 'https://youtube.com/@' },
  { id: 'github', name: 'GitHub', base: 'https://github.com/' },
  { id: 'telegram', name: 'Telegram', base: 'https://t.me/' },
  { id: 'snapchat', name: 'Snapchat', base: 'https://www.snapchat.com/add/' },
  { id: 'whatsapp', name: 'WhatsApp', base: 'https://wa.me/' },
];

export const emptyCard = () => ({ name: '', title: '', org: '', phones: [''], emails: [''], web: '', addr: '', bio: '', socials: [], theme: 0 });

const s = (v) => String(v == null ? '' : v).trim();
const list = (a, max) => (Array.isArray(a) ? a : []).map(s).filter(Boolean).slice(0, max);

export function normalize(c) {
  c = c || {};
  const soc = (Array.isArray(c.socials) ? c.socials : []).map((x) => ({ k: SOCIAL_KINDS.some((y) => y.id === (x && x.k)) ? x.k : 'instagram', h: s(x && x.h).slice(0, 120) })).filter((x) => x.h).slice(0, 6);
  return {
    name: s(c.name).slice(0, 80), title: s(c.title).slice(0, 80), org: s(c.org).slice(0, 80),
    phones: list(c.phones, 3).map((p) => p.slice(0, 32)), emails: list(c.emails, 3).map((p) => p.slice(0, 120)),
    web: s(c.web).slice(0, 200), addr: s(c.addr).slice(0, 200), bio: s(c.bio).slice(0, 400),
    socials: soc, theme: Math.max(0, Math.min(THEMES.length - 1, c.theme | 0)),
  };
}
export const isBlank = (c) => { const n = normalize(c); return !(n.name || n.org || n.phones.length || n.emails.length || n.web || n.bio || n.socials.length); };

// short keys; compact drops the long/optional stuff so it fits tiny chips
export function pack(card, compact = false) {
  const c = normalize(card); const o = { v: 1 };
  if (c.name) o.n = c.name;
  if (c.title) o.t = c.title;
  if (c.org) o.o = c.org;
  const ph = compact ? c.phones.slice(0, 1) : c.phones; if (ph.length) o.p = ph;
  const em = compact ? c.emails.slice(0, 1) : c.emails; if (em.length) o.e = em;
  if (c.web) o.w = c.web;
  if (!compact && c.addr) o.a = c.addr;
  if (!compact && c.bio) o.b = c.bio;
  const so = compact ? c.socials.slice(0, 2) : c.socials; if (so.length) o.s = so.map((x) => [x.k, x.h]);
  if (c.theme) o.c = c.theme;
  return o;
}
export function unpack(o) {
  o = o || {};
  return normalize({
    name: o.n, title: o.t, org: o.o, phones: o.p, emails: o.e, web: o.w, addr: o.a, bio: o.b, theme: o.c,
    socials: (Array.isArray(o.s) ? o.s : []).map((x) => ({ k: x && x[0], h: x && x[1] })),
  });
}

/* ---------- base64url ---------- */
export function b64u(bytes) {
  let str = ''; for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(t) {
  const x = String(t).replace(/-/g, '+').replace(/_/g, '/'); const pad = x + '==='.slice((x.length + 3) % 4);
  const bin = atob(pad); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
}
export const hasCompression = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function pipe(bytes, stream) {
  const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
async function deflate(bytes) { return pipe(bytes, new CompressionStream('deflate-raw')); }
async function inflate(bytes) { return pipe(bytes, new DecompressionStream('deflate-raw')); }

// "z..." = deflate-raw + base64url, "j..." = plain JSON + base64url. Shortest wins.
export async function encodeCard(card, { compact = false } = {}) {
  const json = new TextEncoder().encode(JSON.stringify(pack(card, compact)));
  let best = 'j' + b64u(json);
  if (hasCompression()) {
    try { const z = 'z' + b64u(await deflate(json)); if (z.length < best.length) best = z; } catch (e) { /* plain JSON it is */ }
  }
  return best;
}
export async function decodeCard(str) {
  const t = String(str || '').replace(/^#/, '').trim();
  if (!t) throw new Error('empty');
  const kind = t[0]; const body = t.slice(1);
  let bytes = unb64u(body);
  if (kind === 'z') { if (!hasCompression()) throw new Error('nocompress'); bytes = await inflate(bytes); }
  else if (kind !== 'j') throw new Error('bad');
  const o = JSON.parse(new TextDecoder().decode(bytes));
  if (!o || typeof o !== 'object') throw new Error('bad');
  return unpack(o);
}
export const cardUrl = (origin, enc) => `${origin}/nfc/c/#${enc}`;

/* ---------- vCard 3.0 ---------- */
const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
export const cleanTel = (v) => String(v || '').trim().replace(/[^\d+*#]/g, '');
export function splitName(name) {
  const p = s(name).split(/\s+/).filter(Boolean);
  if (p.length < 2) return { first: p[0] || '', last: '' };
  return { first: p.slice(0, -1).join(' '), last: p[p.length - 1] };
}
export function socialHref(k, h) {
  h = s(h); if (!h) return '';
  if (/^https?:\/\//i.test(h)) return safeHttp(h);
  const kind = SOCIAL_KINDS.find((x) => x.id === k) || SOCIAL_KINDS[0];
  if (kind.id === 'whatsapp') { const n = h.replace(/\D/g, ''); return n ? 'https://wa.me/' + n : ''; }
  return kind.base + encodeURIComponent(h.replace(/^@/, '')).replace(/%2F/gi, '/');
}
export function webHref(w) { w = s(w); if (!w) return ''; return safeHttp(/^[a-z][a-z0-9+.-]*:\/\//i.test(w) ? w : 'https://' + w.replace(/^\/\//, '')); }
// only ever http(s): card data comes from a link, so never trust it
export function safeHttp(u) { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; } }

export function cardToVcard(card) {
  const c = normalize(card);
  const { first, last } = splitName(c.name);
  const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(first)};;;`, `FN:${esc(c.name || c.org || c.phones[0] || c.emails[0] || 'Contact')}`];
  if (c.org) L.push(`ORG:${esc(c.org)}`);
  if (c.title) L.push(`TITLE:${esc(c.title)}`);
  c.phones.forEach((p, i) => L.push(`TEL;TYPE=${i === 0 ? 'CELL' : 'WORK'}:${esc(cleanTel(p) || p)}`));
  c.emails.forEach((e) => L.push(`EMAIL;TYPE=INTERNET:${esc(e)}`));
  const w = webHref(c.web); if (w) L.push(`URL:${esc(w)}`);
  c.socials.forEach((x) => { const h = socialHref(x.k, x.h); if (h) L.push(`URL:${esc(h)}`); });
  if (c.addr) L.push(`ADR;TYPE=WORK:;;${esc(c.addr)};;;;`);
  if (c.bio) L.push(`NOTE:${esc(c.bio)}`);
  L.push('END:VCARD');
  return L.join('\r\n');
}
export function cardInitials(c) {
  const t = s(c.name || c.org || '?').split(/\s+/).filter(Boolean);
  return ((t[0] || '?')[0] + (t.length > 1 ? t[t.length - 1][0] : '')).toUpperCase();
}
