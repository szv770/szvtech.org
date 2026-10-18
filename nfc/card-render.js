// /nfc — draws the digital card (used by the builder preview and the /nfc/c/ viewer) and QR codes.
import { THEMES, SOCIAL_KINDS, normalize, cardInitials, cleanTel, socialHref, webHref } from '/nfc/card.js?v=e246964108';
import { makeMatrix, buildPaths } from '/qr/encode.js?v=604205b2fc';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  phone: 'M6 3.500h3l1.5 4-2 1.300a11 11 0 0 0 5.2 5.200l1.3-2L20 13.500v3a2 2 0 0 1-2 2A15 15 0 0 1 4 5.500a2 2 0 0 1 2-2z',
  mail: 'M5.5 5.500h13a2.5 2.5 0 0 1 2.5 2.500v8a2.5 2.5 0 0 1-2.5 2.500h-13A2.5 2.5 0 0 1 3 16V8a2.5 2.5 0 0 1 2.5-2.500zM4 7.500l8 6 8-6',
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.5 2.6 3.5 5.6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-5.6-3.5-9s1-6.4 3.5-9z',
  pin: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 7.500a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  chat: 'M4 20l1.3-4A8 8 0 1 1 8 18.700zM9.2 9.200c0 3 2.5 5.6 5.6 5.600l1-1.5-2-1-.8.800a4 4 0 0 1-1.8-1.800l.8-.8-1-2z',
  at: 'M15.5 12v1.500a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.5 6.900M12 8.500a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  save: 'M12 4v11M7.5 10.5 12 15l4.5-4.500M5 19h14',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.500v2.500H14zM19 14h1M14 19h1M17.5 17.500H20V20h-3zM17 14v2',
  share: 'M12 15V3.500M7.5 8 12 3.5 16.5 8M5 12.500v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  sms: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4 3v-3a2 2 0 0 1-2-2z',
  x: 'M6 6l12 12M18 6 6 18',
};
export const ci = (n, cls = '') => `<svg class="ci ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || P.web}"/></svg>`;

export const themeOf = (c) => THEMES[Math.max(0, Math.min(THEMES.length - 1, (c && c.theme) | 0))];
export const themeVars = (c) => { const t = themeOf(c).c; return `--k1:${t[0]};--k2:${t[1]};--k3:${t[2]}`; };

// live=true -> real links (viewer); live=false -> inert rows (builder preview)
export function renderCard(card, { live = true } = {}) {
  const c = normalize(card);
  const rows = [];
  const row = (kind, icon, text, sub, href, ext) => {
    const inner = `<i>${ci(icon)}</i><span><b>${esc(text)}</b><small>${esc(sub)}</small></span>`;
    rows.push(live && href ? `<a class="vc-row" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>` : `<div class="vc-row">${inner}</div>`);
  };
  c.phones.forEach((p, i) => row('tel', 'phone', p, i ? 'Phone' : 'Call', 'tel:' + cleanTel(p)));
  c.emails.forEach((e) => row('mail', 'mail', e, 'Email', 'mailto:' + encodeURI(e)));
  const w = webHref(c.web); if (c.web) row('web', 'web', c.web.replace(/^https?:\/\//i, '').replace(/\/$/, ''), 'Website', w, true);
  if (c.addr) row('adr', 'pin', c.addr, 'Map', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.addr), true);
  const soc = c.socials.map((x) => {
    const k = SOCIAL_KINDS.find((y) => y.id === x.k) || SOCIAL_KINDS[0];
    const label = k.name + ' · ' + x.h.replace(/^https?:\/\/(www\.)?/i, '').replace(/^@/, '@').slice(0, 24);
    const href = socialHref(x.k, x.h);
    return live && href ? `<a class="vc-chip" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${ci(x.k === 'whatsapp' ? 'chat' : 'at')}${esc(label)}</a>` : `<span class="vc-chip">${ci(x.k === 'whatsapp' ? 'chat' : 'at')}${esc(label)}</span>`;
  });
  const empty = !(c.name || c.org || c.title);
  return `<article class="vcard" style="${themeVars(c)}">
    <div class="vc-top" aria-hidden="true"></div>
    <div class="vc-av" aria-hidden="true">${esc(cardInitials(c))}</div>
    <div class="vc-body">
      <h2 class="vc-name${c.name ? '' : ' vph'}">${esc(c.name || (empty ? 'Your name' : ''))}</h2>
      ${c.title || c.org ? `<p class="vc-role">${esc(c.title)}${c.title && c.org ? ' <i>·</i> ' : ''}${c.org ? `<b>${esc(c.org)}</b>` : ''}</p>` : (empty ? '<p class="vc-role vph">Title · Company</p>' : '')}
      ${c.bio ? `<p class="vc-bio">${esc(c.bio)}</p>` : ''}
      ${rows.length ? `<div class="vc-rows">${rows.join('')}</div>` : (empty ? '<div class="vc-rows"><div class="vc-row vph"><i>' + ci('phone') + '</i><span><b>+1 555 010 0000</b><small>Call</small></span></div><div class="vc-row vph"><i>' + ci('mail') + '</i><span><b>you@example.com</b><small>Email</small></span></div></div>' : '')}
      ${soc.length ? `<div class="vc-soc">${soc.join('')}</div>` : ''}
    </div>
  </article>`;
}

// QR as an inline SVG string (dark on white). Needs the qrcode-generator global.
export function qrSvg(text, { ecl = 'M', quiet = 3, rounded = true } = {}) {
  if (typeof window.qrcode !== 'function') return '';
  const mx = makeMatrix(window.qrcode, text, ecl);
  const p = buildPaths(mx, { quiet, rounded });
  return `<svg viewBox="0 0 ${p.size} ${p.size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="${rounded ? 'geometricPrecision' : 'crispEdges'}" role="img" aria-label="QR code"><rect width="${p.size}" height="${p.size}" fill="#fff"/><path d="${p.d}${p.eyes || ''}" fill="#0b0a14" fill-rule="nonzero"/></svg>`;
}
export function whenQr(cb) {
  if (typeof window.qrcode === 'function') return cb();
  addEventListener('load', cb, { once: true });
}
