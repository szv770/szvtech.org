// Vercel Node.js serverless function: Chabad.org zmanim as JSON for /time.
//
//   GET /api/zmanim?zip=11213&date=2026-10-09&days=2
//   GET /api/zmanim?cityid=247&date=2026-10-09&days=1
//
// Chabad.org's zmanim RSS feed sends no CORS headers, so the browser cannot
// read it directly. This function fetches a fixed upstream URL built only from
// strictly validated parameters (never an open proxy), parses the feed and
// returns normalized JSON. No dependencies; relies on Node 18+ global fetch.

const UPSTREAM = 'https://www.chabad.org/tools/rss/zmanim.xml';
const USER_AGENT = 'szvtech.org-zmanim/1.0 (+https://szvtech.org/time)';
const TIMEOUT_MS = 6000;
const MAX_BYTES = 256 * 1024;
const CREDIT = 'Zmanim courtesy of Chabad.org';
const CACHE_DATED = 'public, s-maxage=21600, stale-while-revalidate=86400';
const CACHE_UNDATED = 'public, s-maxage=900, stale-while-revalidate=3600';

// Ordered: first matching rule wins. Tested against a normalized label
// (lowercase, curly quotes stripped, whitespace collapsed).
const RULES = [
  [/^dawn\b|alot hashachar/, 'alos', 'Alos Hashachar'],
  [/misheyakir/, 'misheyakir', 'Misheyakir'],
  [/^sunrise\b|hanetz/, 'sunrise', 'Netz'],
  [/^latest shema\b/, 'sofZmanShma', 'Sof Zman Shema'],
  [/^latest shacharit\b/, 'sofZmanTefila', 'Sof Zman Tefillah'],
  [/^midday\b|chatzot hayom/, 'chatzos', 'Chatzos'],
  [/mincha gedolah/, 'minchaGedola', 'Mincha Gedolah'],
  [/mincha ketanah/, 'minchaKetana', 'Mincha Ketanah'],
  [/^plag hamincha/, 'plagHamincha', 'Plag Hamincha'],
  [/^candle lighting after\b/, 'candleLighting', 'Candle lighting (not before)', { after: true }],
  [/^candle lighting\b/, 'candleLighting', 'Candle lighting'],
  [/^sunset\b|shkiah/, 'sunset', 'Shkiah'],
  [/^nightfall\b|tzeit/, 'tzeis', 'Tzeis'],
  [/^shabbat\s*\/\s*holiday ends$/, 'shabbosEnds', 'Shabbos / Yom Tov ends', { also: ['holidayEnds'] }],
  [/^shabbat ends$/, 'shabbosEnds', 'Shabbos ends'],
  [/^holiday\s*\/\s*fast ends$/, 'holidayEnds', 'Yom Tov / fast ends', { also: ['fastEnds'] }],
  [/^holiday ends$/, 'holidayEnds', 'Yom Tov ends'],
  [/^fast begins$/, 'fastBegins', 'Fast begins'],
  [/^fast ends$/, 'fastEnds', 'Fast ends'],
  [/^midnight\b|chatzot halailah/, 'chatzosLayla', 'Chatzos Halaylah'],
  [/^bedikat chametz/, 'bedikasChametz', 'Bedikas Chametz'],
  [/^finish eating chametz/, 'sofZmanAchilasChametz', 'Finish eating chametz before'],
  [/^sell and burn chametz/, 'sofZmanBiurChametz', 'Sell and burn chametz before'],
];

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeCodePoint(n) {
  try { return String.fromCodePoint(n); } catch { return ''; }
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

function classify(label) {
  const norm = label.toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  for (const [re, key, short, extra] of RULES) {
    if (re.test(norm)) return { key, label: short, ...(extra || {}) };
  }
  return { key: 'other', label };
}

// "5:35 AM" -> 335 ; "12:43 AM" -> 43 ; "12:42 PM" -> 762
function toMinutes(time) {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === 'PM') h += 12;
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Split combined labels such as "Dawn (Alot Hashachar) | Fast Begins" and the
// malformed "Sunset (Shkiah)Fast Begins" into separate parts.
function splitLabel(label) {
  return label
    .replace(/\)\s*(Fast (?:Begins|Ends))\b/g, ') | $1')
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse one Chabad.org zmanim RSS document.
 * Returns { location, hebrewDate, englishDate, link, copyright, shaahZmanit,
 *           feedDate ("M/D/YYYY" from item titles), noLocation, items[] }.
 */
export function parseFeed(xml) {
  const channel = (xml.match(/<channel>([\s\S]*)<\/channel>/i) || [, xml])[1];
  const head = channel.split(/<item[\s>]/i)[0];
  const title = tag(head, 'title');
  const locMatch = /Halachic Times for (.*?) on [A-Z][a-z]+day, /.exec(title);
  const out = {
    location: locMatch ? locMatch[1].trim() : '',
    hebrewDate: tag(head, 'hebrew_date'),
    englishDate: tag(head, 'english_date'),
    link: tag(head, 'link'),
    copyright: tag(head, 'copyright'),
    shaahZmanit: null,
    feedDate: null,
    noLocation: false,
    items: [],
  };

  let seenPm = false;
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(channel))) {
    const t = tag(m[1], 'title');
    if (/^no location set$/i.test(t)) { out.noLocation = true; continue; }
    const pm = /^(.*?) - (\d{1,2}:\d{2} (?:AM|PM)|\d{1,3}:\d{2} min\.)\s*(?:--\s*\((\d{1,2}\/\d{1,2}\/\d{4})\))?\s*$/.exec(t);
    if (!pm) continue;
    const [, rawLabel, time, d] = pm;
    if (d && !out.feedDate) out.feedDate = d;
    if (time.endsWith('min.')) {
      if (/shaah zmanit/i.test(rawLabel)) out.shaahZmanit = time.replace(/\s*min\.$/, '');
      else out.items.push({ key: 'other', label: rawLabel, chabadLabel: rawLabel, time, minutes: null, nextDay: false });
      continue;
    }
    const minutes = toMinutes(time);
    if (minutes === null) continue;
    const isPm = time.endsWith('PM');
    // Items are listed chronologically; an AM time after any PM time belongs
    // to the following civil morning (e.g. Chatzot HaLailah at 12:43 AM).
    const nextDay = !isPm && seenPm;
    if (isPm) seenPm = true;
    for (const part of splitLabel(rawLabel)) {
      const c = classify(part);
      const item = { key: c.key, label: c.label, chabadLabel: part, time, minutes, nextDay };
      if (c.after) item.after = true;
      if (c.also) item.also = c.also;
      out.items.push(item);
    }
  }
  if (!out.location && !out.items.length) out.noLocation = true;
  return out;
}

// ---------- validation ----------

function isoToday(tz) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t;
}

const DAY = 86400000;
const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const mdyOf = (t) => { const d = new Date(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; };

const ALLOWED = new Set(['zip', 'cityid', 'date', 'days']);

export function validate(searchParams) {
  for (const k of ALLOWED) {
    if (searchParams.getAll(k).length > 1) return { error: `duplicate parameter: ${k}` };
  }
  const zip = searchParams.get('zip');
  const cityid = searchParams.get('cityid');
  if ((zip === null) === (cityid === null)) return { error: 'provide exactly one of zip or cityid' };
  let locationid, locationtype;
  if (zip !== null) {
    if (!/^\d{5}$/.test(zip)) return { error: 'zip must be 5 digits' };
    locationid = zip; locationtype = '2';
  } else {
    if (!/^\d{1,7}$/.test(cityid)) return { error: 'cityid must be 1-7 digits' };
    locationid = cityid; locationtype = '1';
  }

  const todayUtc = parseIso(isoToday('UTC'));
  let start;
  const date = searchParams.get('date');
  const dated = date !== null;
  if (dated) {
    start = parseIso(date);
    if (start === null) return { error: 'date must be a valid YYYY-MM-DD' };
    const diff = Math.round((start - todayUtc) / DAY);
    if (diff < -2 || diff > 400) return { error: 'date out of range (-2 to +400 days from today)' };
  } else {
    // Chabad.org's own "today" follows US Eastern time; the UI should send an
    // explicit date (the viewer's local date) whenever it can.
    start = parseIso(isoToday('America/New_York'));
  }

  let days = 2;
  const daysRaw = searchParams.get('days');
  if (daysRaw !== null) {
    if (!/^[1-3]$/.test(daysRaw)) return { error: 'days must be an integer 1-3' };
    days = Number(daysRaw);
  }
  return { locationid, locationtype, start, days, dated };
}

// ---------- upstream ----------

class UpstreamError extends Error {}

async function fetchDay(locationid, locationtype, t) {
  const url = new URL(UPSTREAM);
  url.searchParams.set('locationid', locationid);
  url.searchParams.set('locationtype', locationtype);
  url.searchParams.set('tdate', mdyOf(t));
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new UpstreamError(e && e.name === 'TimeoutError' ? 'upstream timeout' : 'upstream fetch failed');
  }
  const ct = res.headers.get('content-type') || '';
  if (res.status !== 200) throw new UpstreamError(`upstream status ${res.status}`);
  if (!/xml/i.test(ct)) throw new UpstreamError('upstream returned non-XML');
  const xml = await res.text();
  if (xml.length > MAX_BYTES) throw new UpstreamError('upstream response too large');
  if (!/<rss[\s>]/i.test(xml)) throw new UpstreamError('upstream returned unexpected document');
  const feed = parseFeed(xml);
  if (!feed.noLocation && feed.feedDate && feed.feedDate !== mdyOf(t)) {
    // Upstream silently falls back to "today" for dates it rejects.
    throw new UpstreamError('upstream returned a different date');
  }
  return feed;
}

// ---------- handler ----------

function send(req, res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', cache || 'no-store');
  const json = JSON.stringify(body);
  res.setHeader('Content-Length', Buffer.byteLength(json));
  res.end(req.method === 'HEAD' ? undefined : json);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    res.end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return send(req, res, 405, { error: 'method not allowed' });
  }

  let params;
  try {
    params = new URL(req.url || '/', 'http://localhost').searchParams;
  } catch {
    return send(req, res, 400, { error: 'bad request' });
  }
  const v = validate(params);
  if (v.error) return send(req, res, 400, { error: v.error });

  const dates = Array.from({ length: v.days }, (_, i) => v.start + i * DAY);
  let feeds;
  try {
    feeds = await Promise.all(dates.map((t) => fetchDay(v.locationid, v.locationtype, t)));
  } catch (e) {
    return send(req, res, 502, { error: e instanceof UpstreamError ? e.message : 'upstream error' });
  }
  if (feeds.some((f) => f.noLocation)) return send(req, res, 404, { error: 'unknown location' });

  const body = {
    source: 'chabad.org',
    credit: CREDIT,
    copyright: feeds[0].copyright || undefined,
    link: `https://www.chabad.org/calendar/zmanim_cdo/locationid/${v.locationid}/locationtype/${v.locationtype}`,
    location: feeds[0].location,
    days: feeds.map((f, i) => ({
      date: isoOf(dates[i]),
      hebrewDate: f.hebrewDate,
      shaahZmanit: f.shaahZmanit,
      items: f.items,
    })),
  };
  return send(req, res, 200, body, v.dated ? CACHE_DATED : CACHE_UNDATED);
}
