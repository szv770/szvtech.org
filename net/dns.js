// /net — DNS over HTTPS lookups, straight from the browser (both resolvers send CORS headers).
import { DNS_TYPES, DNS_STATUS } from '/net/stats.js?v=df6c47bf1f';

export const RESOLVERS = {
  cloudflare: { label: 'Cloudflare 1.1.1.1', host: 'cloudflare-dns.com', url: (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`, headers: { accept: 'application/dns-json' } },
  google: { label: 'Google 8.8.8.8', host: 'dns.google', url: (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`, headers: {} },
};
export const TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];

async function one(resolver, name, type, signal) {
  const R = RESOLVERS[resolver] || RESOLVERS.cloudflare;
  const t0 = performance.now();
  const r = await fetch(R.url(name, type), { headers: R.headers, signal, cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' });
  if (!r.ok) throw new Error(`${R.host} answered HTTP ${r.status}`);
  const j = await r.json();
  return { type, ms: performance.now() - t0, j };
}

// -> { name, status, ms, ad, groups: [{type, records:[{name, type, ttl, data, pref}]}], errors }
export async function lookup(name, type, resolver, signal) {
  const types = type === 'ALL' ? TYPES : [type];
  const t0 = performance.now();
  const settled = await Promise.allSettled(types.map((t) => one(resolver, name, t, signal)));
  if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
  const out = { name, resolver, status: null, ad: false, ms: performance.now() - t0, groups: [], errors: [] };
  for (const s of settled) {
    if (s.status === 'rejected') { out.errors.push(String(s.reason && s.reason.message || s.reason)); continue; }
    const { type: t, j } = s.value;
    const st = DNS_STATUS[j.Status] || ('RCODE ' + j.Status);
    if (out.status === null || (out.status !== 'NOERROR' && st === 'NOERROR')) out.status = st;
    if (j.AD) out.ad = true;
    const want = t;
    const recs = (j.Answer || []).map((a) => normalize(a)).filter(Boolean);
    // the answer to an A query can include the CNAME chain: show it under its own type
    const main = recs.filter((r) => r.type === want);
    const chain = recs.filter((r) => r.type !== want);
    if (want === 'MX') main.sort((a, b) => a.pref - b.pref || a.data.localeCompare(b.data));
    out.groups.push({ type: want, records: main, chain, status: st });
  }
  if (out.status === null) throw new Error(out.errors[0] || 'lookup failed');
  return out;
}

function normalize(a) {
  if (!a || typeof a.data !== 'string') return null;
  const type = DNS_TYPES[a.type] || ('TYPE' + a.type);
  let data = a.data, pref = null;
  if (type === 'MX') {
    const m = /^(\d+)\s+(.*)$/.exec(data);
    if (m) { pref = +m[1]; data = m[2]; }
  } else if (type === 'TXT') {
    // "part1" "part2" -> joined, unquoted
    const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
    if (parts) data = parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
  }
  return { name: String(a.name || '').replace(/\.$/, ''), type, ttl: Number(a.TTL), data: data.replace(/\.$/, ''), pref };
}
