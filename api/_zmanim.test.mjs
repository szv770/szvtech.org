// Tests for api/zmanim.js. Run with:  node api/_zmanim.test.mjs
//   --offline   run only the parser/validation tests (no network)
//
// This file lives under api/, so Vercel may deploy it as a function. The
// tests only run when this file is executed directly; as a deployed function
// it just answers 404.
import { pathToFileURL } from 'node:url';
import handler, { parseFeed, validate } from './zmanim.js';

export default function notAFunction(req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
}

const FIXTURE = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0"><channel>
  <title>Zmanim - Halachic Times for Brooklyn, NY 11213 on Wednesday, August 11, 2027 - 08 Av, 5787</title>
  <hebrew_date>Av 8, 5787</hebrew_date>
  <english_date>August 11, 2027</english_date>
  <link>https://www.chabad.org/calendar/zmanim_cdo/locationid/11213/locationtype/2/tdate/8/11/2027</link>
  <copyright>Copyright 2027, Chabad.org - Chabad-Lubavitch Media Center, all rights reserved.</copyright>
  <item><category>4:24 AM</category><title>Dawn (Alot Hashachar) | Fast Begins - 4:24 AM -- (8/11/2027)</title></item>
  <item><category>5:08 AM</category><title>Earliest Tallit and Tefillin (Misheyakir) - 5:08 AM -- (8/11/2027)</title></item>
  <item><title>Sunrise (Hanetz Hachamah) - 6:02 AM -- (8/11/2027)</title></item>
  <item><title>Latest Shema - 9:29 AM -- (8/11/2027)</title></item>
  <item><title>Latest Shacharit - 10:39 AM -- (8/11/2027)</title></item>
  <item><title>Midday (Chatzot Hayom) - 1:00 PM -- (8/11/2027)</title></item>
  <item><title>Earliest Mincha (Mincha Gedolah) - 1:36 PM -- (8/11/2027)</title></item>
  <item><title>Mincha Ketanah (“Small Mincha”) - 5:08 PM -- (8/11/2027)</title></item>
  <item><title>Plag Hamincha (&#8220;Half of Mincha&#8221;) - 6:36 PM -- (8/11/2027)</title></item>
  <item><title>Candle Lighting after - 7:45 PM -- (8/11/2027)</title></item>
  <item><title>Sunset (Shkiah)Fast Begins - 7:59 PM -- (8/11/2027)</title></item>
  <item><title>Nightfall (Tzeit Hakochavim) | Fast Ends - 8:29 PM -- (8/11/2027)</title></item>
  <item><title>Shabbat/Holiday Ends - 8:40 PM -- (8/11/2027)</title></item>
  <item><title>Holiday/Fast Ends - 8:41 PM -- (8/11/2027)</title></item>
  <item><title>Something New &amp; Unexpected - 8:50 PM -- (8/11/2027)</title></item>
  <item><title>Midnight (Chatzot HaLailah) - 12:43 AM -- (8/11/2027)</title></item>
  <item><title>Shaah Zmanit (proportional hour) - 70:28 min. -- (8/11/2027)</title></item>
</channel></rss>`;

const NO_LOCATION = `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0"><channel>
  <title>Zmanim - Halachic Times for  on Friday, October 09, 2026 - 28 Tishrei, 5787</title>
  <item><title>No location set</title><link>https://www.chabad.org/article.htm/AID/143790</link></item>
</channel></rss>`;

let failures = 0;
let passes = 0;
function check(name, cond, detail) {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${detail !== undefined ? ' -- ' + JSON.stringify(detail) : ''}`); }
}

function offlineTests() {
  console.log('parser (offline fixture)');
  const f = parseFeed(FIXTURE);
  const by = (k) => f.items.filter((i) => i.key === k);
  check('location', f.location === 'Brooklyn, NY 11213', f.location);
  check('hebrewDate', f.hebrewDate === 'Av 8, 5787', f.hebrewDate);
  check('shaahZmanit', f.shaahZmanit === '70:28', f.shaahZmanit);
  check('shaah zmanit not in items', !f.items.some((i) => /Shaah/.test(i.chabadLabel)));
  check('feedDate', f.feedDate === '8/11/2027', f.feedDate);
  check('alos split from fast begins', by('alos')[0]?.minutes === 264 && by('fastBegins').length === 2, f.items.slice(0, 2));
  check('alos chabadLabel', by('alos')[0]?.chabadLabel === 'Dawn (Alot Hashachar)');
  check('misheyakir', by('misheyakir')[0]?.label === 'Misheyakir');
  check('chatzos 1:00 PM = 780', by('chatzos')[0]?.minutes === 780);
  check('mincha ketana curly quotes', by('minchaKetana')[0]?.chabadLabel === 'Mincha Ketanah (“Small Mincha”)');
  check('plag numeric entities decoded', by('plagHamincha')[0]?.chabadLabel === 'Plag Hamincha (“Half of Mincha”)');
  check('candle lighting after', by('candleLighting')[0]?.after === true && by('candleLighting')[0]?.label === 'Candle lighting (not before)');
  check('malformed "Sunset (Shkiah)Fast Begins" split', by('sunset')[0]?.chabadLabel === 'Sunset (Shkiah)' && by('fastBegins')[1]?.minutes === 1199);
  check('tzeis + fastEnds', by('tzeis').length === 1 && by('fastEnds')[0]?.minutes === 1229);
  check('Shabbat/Holiday Ends', by('shabbosEnds')[0]?.also?.[0] === 'holidayEnds');
  check('Holiday/Fast Ends', by('holidayEnds')[0]?.also?.[0] === 'fastEnds');
  check('unknown kept as other', by('other')[0]?.label === 'Something New & Unexpected');
  const cl = by('chatzosLayla')[0];
  check('12:43 AM next day', cl?.minutes === 43 && cl?.nextDay === true && cl?.time === '12:43 AM', cl);
  check('morning items not nextDay', by('alos')[0]?.nextDay === false);
  check('12:xx PM is noon', parseFeed(FIXTURE.replace('1:00 PM', '12:42 PM')).items.find((i) => i.key === 'chatzos').minutes === 762);
  check('noLocation fixture', parseFeed(NO_LOCATION).noLocation === true);

  console.log('validation (offline)');
  const V = (q) => validate(new URLSearchParams(q));
  const today = new Date().toISOString().slice(0, 10);
  check('zip ok', V('zip=11213').locationtype === '2');
  check('cityid ok', V('cityid=247').locationtype === '1');
  check('days default 2', V('zip=11213').days === 2);
  check('zip 1121 rejected', !!V('zip=1121').error);
  check('zip with letters rejected', !!V('zip=1121a').error);
  check('both rejected', !!V('zip=11213&cityid=247').error);
  check('neither rejected', !!V('date=' + today).error);
  check('duplicate zip rejected', !!V('zip=11213&zip=10001').error);
  check('cityid 8 digits rejected', !!V('cityid=12345678').error);
  check('bad date rejected', !!V('zip=11213&date=2027-02-30').error);
  check('date format rejected', !!V('zip=11213&date=10/9/2026').error);
  check('days 4 rejected', !!V('zip=11213&days=4').error);
  check('days 1.5 rejected', !!V('zip=11213&days=1.5').error);
  check('encoded injection rejected', !!V('zip=' + encodeURIComponent('11213&locationtype=1')).error);
}

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(b) { this.body = b; this.done = true; },
  };
}

async function call(query, method = 'GET') {
  const res = mockRes();
  await handler({ method, url: '/api/zmanim' + (query ? '?' + query : ''), headers: {} }, res);
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch {}
  return { status: res.statusCode, headers: res.headers, json };
}

const isoAdd = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

async function onlineTests() {
  console.log('handler (live chabad.org)');
  const today = new Date().toISOString().slice(0, 10);

  const r = await call(`zip=11213&date=${today}`);
  check('11213 two days -> 200', r.status === 200, r.json);
  check('content-type', r.headers['content-type'] === 'application/json; charset=utf-8');
  check('cache-control', r.headers['cache-control'] === 'public, s-maxage=21600, stale-while-revalidate=86400');
  check('cors', r.headers['access-control-allow-origin'] === '*');
  check('credit', r.json?.credit === 'Zmanim courtesy of Chabad.org' && r.json?.source === 'chabad.org');
  check('location Brooklyn', r.json?.location === 'Brooklyn, NY 11213', r.json?.location);
  check('2 days with dates', r.json?.days?.length === 2 && r.json.days[0].date === today && r.json.days[1].date === isoAdd(today, 1));
  const d0 = r.json?.days?.[0];
  check('core keys present', d0 && ['alos', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'sunset', 'chatzosLayla'].every((k) => d0.items.some((i) => i.key === k)), d0?.items?.map((i) => i.key));
  check('hebrewDate + shaahZmanit', /\d{4}$/.test(d0?.hebrewDate || '') && /^\d+:\d{2}$/.test(d0?.shaahZmanit || ''), d0 && [d0.hebrewDate, d0.shaahZmanit]);
  if (d0) console.log('       sample day:', JSON.stringify({ ...d0, items: d0.items.map((i) => `${i.key}=${i.time}${i.nextDay ? '(+1)' : ''}`) }));

  // Next Friday/Saturday pair with Shabbos ends (skip Yom Tov weekends).
  let fri = isoAdd(today, 1);
  while (new Date(fri + 'T00:00:00Z').getUTCDay() !== 5) fri = isoAdd(fri, 1);
  let found = false;
  for (let w = 0; w < 4 && !found; w++, fri = isoAdd(fri, 7)) {
    const s = await call(`zip=11213&date=${fri}&days=2`);
    if (s.status !== 200) { check(`Friday ${fri} -> 200`, false, s.json); break; }
    const [f, sat] = s.json.days;
    const cl = f.items.find((i) => i.key === 'candleLighting');
    const se = sat.items.find((i) => i.key === 'shabbosEnds');
    if (cl && se) {
      found = true;
      check(`Friday ${fri} candleLighting`, !!cl && cl.minutes > 900, cl);
      check(`Saturday ${sat.date} shabbosEnds`, !!se && se.minutes > 900, se);
      check('Saturday misheyakir (Tallit only) mapped', sat.items.some((i) => i.key === 'misheyakir' && i.chabadLabel === 'Earliest Tallit (Misheyakir)'));
    }
  }
  check('found Friday candle lighting + Saturday Shabbos ends', found);

  const j = await call(`cityid=247&date=${today}&days=1`);
  check('cityid 247 -> 200 Jerusalem', j.status === 200 && /Jerusalem/.test(j.json?.location || ''), j.json?.location ?? j.json);
  check('cityid link', j.json?.link === 'https://www.chabad.org/calendar/zmanim_cdo/locationid/247/locationtype/1');
  check('days=1', j.json?.days?.length === 1);

  const nd = await call('zip=11213&days=1');
  check('no date -> 200 with short cache', nd.status === 200 && /s-maxage=900/.test(nd.headers['cache-control'] || ''), nd.headers['cache-control']);

  const bad = [
    ['zip=1121', 400],
    ['zip=99999&date=' + today + '&days=1', 404],
    ['zip=11213&date=' + isoAdd(today, 401), 400],
    ['zip=11213&date=' + isoAdd(today, -3), 400],
    ['zip=11213&cityid=247', 400],
    ['zip=11213&days=0', 400],
    ['', 400],
  ];
  for (const [q, want] of bad) {
    const b = await call(q);
    check(`${q || '(no params)'} -> ${want}`, b.status === want && typeof b.json?.error === 'string', [b.status, b.json]);
  }
  const inj = await call(`zip=11213&x=..&locationtype=1&locationid=247&date=${today}&days=1`);
  check('extra params ignored (still Brooklyn zip)', inj.status === 200 && inj.json?.location === 'Brooklyn, NY 11213', inj.json?.location ?? inj.json);
  const inj2 = await call('zip=11213%26locationtype%3D1');
  check('encoded injection -> 400', inj2.status === 400);

  const post = await call('zip=11213', 'POST');
  check('POST -> 405', post.status === 405);
  const opt = await call('zip=11213', 'OPTIONS');
  check('OPTIONS -> 204', opt.status === 204);
  const head = await call(`zip=11213&date=${today}&days=1`, 'HEAD');
  check('HEAD -> 200 without body', head.status === 200 && head.json === null);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  offlineTests();
  if (!process.argv.includes('--offline')) await onlineTests();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
