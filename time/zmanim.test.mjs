// zmanim.test.mjs — run with: node time/zmanim.test.mjs   (also: TZ=Asia/Tokyo node time/zmanim.test.mjs)
// Exits non-zero on any failure. No network access: reference values below were
// fetched once from Hebcal's public API (https://www.hebcal.com/zmanim?cfg=json&...)
// and from the chabad.org zmanim feed
// (https://www.chabad.org/tools/rss/zmanim.xml?locationid=<zip>&locationtype=2&tdate=M/D/YYYY,
// Jerusalem = locationtype=1&locationid=247) on 2026-10-09, and pasted in as fixtures.
import { sunTimes, sunPosition, zmanim, nextZman, localYMD, ZMANIM_LABELS, DEFAULTS, CHABAD_ROUNDING, roundZman } from './zmanim.js';

let failures = 0, passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error('FAIL:', msg); }
}
function section(name) { console.log(`\n== ${name} (process TZ=${process.env.TZ || '(unset)'}, device tz=${Intl.DateTimeFormat().resolvedOptions().timeZone})`); }

const LOCS = {
  ny: { lat: 40.6694, lon: -73.9422, tz: 'America/New_York' },
  jer: { lat: 31.778, lon: 35.235, tz: 'Asia/Jerusalem', candleMinutes: 40 },
  lon: { lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
  mel: { lat: -37.8136, lon: 144.9631, tz: 'Australia/Melbourne' },
  la: { lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles' },
};

// --- chabad.org feed (primary calibration target; module DEFAULTS follow it) ---
// Coordinates for zips are the zip centroids (chabad.org's exact coordinates are not published).
const CHABAD_LOCS = {
  '11213': { lat: 40.6712, lon: -73.9363, tz: 'America/New_York' },          // Crown Heights
  '90036': { lat: 34.0700, lon: -118.3500, tz: 'America/Los_Angeles' },      // Los Angeles
  '33139': { lat: 25.7843, lon: -80.1428, tz: 'America/New_York' },          // Miami Beach
  '247': { lat: 31.778, lon: 35.235, tz: 'Asia/Jerusalem', candleMinutes: 40 }, // Jerusalem
};
const CHABAD_KEYS = ['alos', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'minchaGedola',
  'minchaKetana', 'plagHamincha', 'candleLighting', 'sunset', 'tzeis', 'shabbosEnds', 'shaah'];
// [location id, date, local HH:MM per CHABAD_KEYS ('-' = not listed that day; shaah = mm:ss)]
const CHABAD = [
  ['11213', '2026-03-08', '05:53 06:30 07:19 10:10 11:09 13:06 13:37 16:33 17:46 - 18:55 19:23 - 58:41'],
  ['11213', '2026-03-13', '05:45 06:22 07:11 10:06 11:05 13:05 13:36 16:35 17:50 18:42 19:00 19:28 - 59:49'],
  ['11213', '2026-03-14', '05:43 06:20 07:09 10:05 11:05 13:05 13:36 16:36 17:51 - 19:01 - 19:42 60:02'],
  ['11213', '2026-06-19', '03:28 04:22 05:24 09:08 10:24 12:57 13:36 17:24 19:00 20:12 20:30 21:04 - 76:14'],
  ['11213', '2026-06-20', '03:28 04:23 05:25 09:08 10:24 12:57 13:36 17:25 19:00 - 20:30 - 21:21 76:14'],
  ['11213', '2026-06-21', '03:28 04:23 05:25 09:08 10:25 12:57 13:36 17:25 19:00 - 20:30 21:04 - 76:14'],
  ['11213', '2026-10-09', '05:35 06:11 07:01 09:49 10:47 12:42 13:12 16:05 17:17 18:07 18:25 18:53 - 57:40'],
  ['11213', '2026-10-10', '05:36 06:12 07:02 09:49 10:47 12:42 13:12 16:04 17:16 - 18:23 - 19:04 57:27'],
  ['11213', '2026-11-01', '04:59 05:35 06:26 09:00 09:53 11:39 12:06 14:44 15:51 - 16:52 17:21 - 52:51'],
  ['11213', '2026-12-18', '05:41 06:20 07:14 09:31 10:18 11:52 12:16 14:38 15:37 16:12 16:30 17:02 - 47:05'],
  ['11213', '2026-12-19', '05:42 06:20 07:15 09:31 10:18 11:52 12:17 14:38 15:37 - 16:31 - 17:16 47:04'],
  ['11213', '2026-12-21', '05:43 06:21 07:16 09:32 10:19 11:53 12:18 14:39 15:38 - 16:32 17:03 - 47:03'],
  ['247', '2026-03-08', '04:42 05:15 05:58 08:52 09:51 11:50 12:20 15:18 16:32 - 17:42 18:07 - 59:14'],
  ['247', '2026-03-13', '04:36 05:09 05:52 08:48 09:48 11:48 12:19 15:20 16:35 17:06 17:46 18:11 - 60:03'],
  ['247', '2026-03-14', '04:35 05:07 05:51 08:47 09:48 11:48 12:19 15:20 16:35 - 17:46 - 18:23 60:13'],
  ['247', '2026-06-19', '04:00 04:42 05:34 09:05 10:16 12:40 13:17 16:52 18:22 19:07 19:47 20:16 - 71:48'],
  ['247', '2026-06-20', '04:01 04:42 05:34 09:05 10:17 12:40 13:17 16:53 18:22 - 19:48 - 20:30 71:48'],
  ['247', '2026-06-21', '04:01 04:43 05:34 09:05 10:17 12:40 13:17 16:53 18:23 - 19:48 20:17 - 71:48'],
  ['247', '2026-10-09', '05:22 05:54 06:38 09:30 10:29 12:26 12:56 15:52 17:05 17:34 18:14 18:39 - 58:36'],
  ['247', '2026-10-10', '05:23 05:55 06:39 09:30 10:29 12:25 12:56 15:51 17:04 - 18:13 - 18:49 58:27'],
  ['247', '2026-11-01', '04:37 05:10 05:55 08:37 09:32 11:22 11:51 14:36 15:45 - 16:50 17:15 - 55:09'],
  ['247', '2026-12-18', '05:11 05:46 06:33 09:02 09:53 11:35 12:02 14:35 15:39 15:58 16:38 17:05 - 51:02'],
  ['247', '2026-12-19', '05:12 05:46 06:34 09:03 09:54 11:36 12:02 14:35 15:39 - 16:38 - 17:18 51:02'],
  ['247', '2026-12-21', '05:13 05:47 06:35 09:04 09:55 11:37 12:03 14:36 15:40 - 16:39 17:07 - 51:01'],
  ['33139', '2026-03-08', '06:25 06:56 07:37 10:32 11:32 13:31 14:02 17:01 18:15 - 19:26 19:50 - 59:39'],
  ['33139', '2026-03-13', '06:20 06:51 07:32 10:29 11:29 13:30 14:01 17:02 18:17 19:11 19:29 19:52 - 60:17'],
  ['33139', '2026-03-14', '06:19 06:50 07:31 10:28 11:29 13:29 14:01 17:02 18:17 - 19:29 - 20:03 60:24'],
  ['33139', '2026-06-19', '05:05 05:42 06:30 09:53 11:03 13:22 13:57 17:25 18:52 19:57 20:15 20:41 - 69:22'],
  ['33139', '2026-06-20', '05:05 05:42 06:30 09:54 11:03 13:22 13:57 17:26 18:52 - 20:15 - 20:54 69:22'],
  ['33139', '2026-06-21', '05:05 05:43 06:30 09:54 11:03 13:22 13:58 17:26 18:53 - 20:15 20:42 - 69:22'],
  ['33139', '2026-10-09', '06:04 06:35 07:17 10:10 11:09 13:07 13:38 16:35 17:49 18:41 18:59 19:22 - 59:04'],
  ['33139', '2026-10-10', '06:05 06:36 07:17 10:10 11:09 13:07 13:37 16:34 17:48 - 18:58 - 19:32 58:57'],
  ['33139', '2026-11-01', '05:16 05:47 06:29 09:14 10:11 12:03 12:33 15:22 16:32 - 17:39 18:03 - 56:24'],
  ['33139', '2026-12-18', '05:44 06:16 07:01 09:37 10:30 12:17 12:44 15:24 16:31 17:15 17:33 17:59 - 53:16'],
  ['33139', '2026-12-19', '05:44 06:17 07:02 09:38 10:31 12:17 12:45 15:25 16:31 - 17:34 - 18:11 53:16'],
  ['33139', '2026-12-21', '05:45 06:18 07:03 09:39 10:32 12:18 12:46 15:26 16:32 - 17:35 18:00 - 53:15'],
  ['90036', '2026-03-08', '05:55 06:28 07:13 10:06 11:05 13:04 13:34 16:32 17:46 - 18:56 19:21 - 59:10'],
  ['90036', '2026-03-13', '05:48 06:22 07:06 10:02 11:02 13:03 13:34 16:34 17:49 18:42 19:00 19:25 - 60:03'],
  ['90036', '2026-03-14', '05:47 06:20 07:05 10:02 11:02 13:02 13:33 16:34 17:49 - 19:01 - 19:38 60:14'],
  ['90036', '2026-06-19', '04:04 04:48 05:42 09:16 10:29 12:54 13:32 17:10 18:41 19:50 20:08 20:37 - 72:50'],
  ['90036', '2026-06-20', '04:04 04:49 05:42 09:16 10:29 12:55 13:32 17:10 18:42 - 20:08 - 20:52 72:50'],
  ['90036', '2026-06-21', '04:05 04:49 05:42 09:16 10:29 12:55 13:32 17:11 18:42 - 20:08 20:38 - 72:50'],
  ['90036', '2026-10-09', '05:36 06:09 06:54 09:45 10:43 12:40 13:10 16:05 17:18 18:09 18:27 18:52 - 58:19'],
  ['90036', '2026-10-10', '05:36 06:10 06:55 09:45 10:43 12:40 13:10 16:04 17:17 - 18:25 - 19:02 58:09'],
  ['90036', '2026-11-01', '04:53 05:27 06:13 08:53 09:47 11:36 12:04 14:48 15:56 - 17:00 17:27 - 54:33'],
  ['90036', '2026-12-18', '05:29 06:04 06:54 09:19 10:09 11:50 12:16 14:46 15:49 16:29 16:47 17:15 - 50:06'],
  ['90036', '2026-12-19', '05:29 06:05 06:54 09:20 10:10 11:50 12:16 14:46 15:49 - 16:47 - 17:28 50:06'],
  ['90036', '2026-12-21', '05:31 06:06 06:55 09:21 10:11 11:51 12:17 14:47 15:50 - 16:48 17:16 - 50:05'],
];

// Hebcal fields mapped to ours: alos=alotHaShachar (16.1°), sofZmanTefila=sofZmanTfilla,
// chatzos=chatzot, plagHamincha=plagHaMincha, tzeis=tzeit85deg (8.5°). Hebcal rounds to the minute.
// null = Hebcal omitted the field (the event does not occur that day).
const HEBCAL = [
  { loc: 'jer', date: '2026-03-27', times: {
    alos: "05:22:00+03:00", sunrise: "06:34:00+03:00", sofZmanShma: "09:39:00+03:00", sofZmanTefila: "10:41:00+03:00", chatzos: "12:45:00+03:00", minchaGedola: "13:16:00+03:00", minchaKetana: "16:21:00+03:00", plagHamincha: "17:38:00+03:00", sunset: "18:55:00+03:00", tzeis: "19:31:00+03:00" } },
  { loc: 'jer', date: '2026-06-21', times: {
    alos: "04:06:00+03:00", sunrise: "05:34:00+03:00", sofZmanShma: "09:07:00+03:00", sofZmanTefila: "10:19:00+03:00", chatzos: "12:41:00+03:00", minchaGedola: "13:16:00+03:00", minchaKetana: "16:50:00+03:00", plagHamincha: "18:19:00+03:00", sunset: "19:48:00+03:00", tzeis: "20:30:00+03:00" } },
  { loc: 'jer', date: '2026-10-25', times: {
    alos: "04:37:00+02:00", sunrise: "05:50:00+02:00", sofZmanShma: "08:36:00+02:00", sofZmanTefila: "09:32:00+02:00", chatzos: "11:23:00+02:00", minchaGedola: "11:51:00+02:00", minchaKetana: "14:37:00+02:00", plagHamincha: "15:47:00+02:00", sunset: "16:56:00+02:00", tzeis: "17:33:00+02:00" } },
  { loc: 'jer', date: '2026-12-21', times: {
    alos: "05:17:00+02:00", sunrise: "06:35:00+02:00", sofZmanShma: "09:06:00+02:00", sofZmanTefila: "09:56:00+02:00", chatzos: "11:37:00+02:00", minchaGedola: "12:02:00+02:00", minchaKetana: "14:33:00+02:00", plagHamincha: "15:36:00+02:00", sunset: "16:39:00+02:00", tzeis: "17:19:00+02:00" } },
  { loc: 'la', date: '2026-03-08', times: {
    alos: "05:59:00-07:00", sunrise: "07:12:00-07:00", sofZmanShma: "10:08:00-07:00", sofZmanTefila: "11:07:00-07:00", chatzos: "13:04:00-07:00", minchaGedola: "13:33:00-07:00", minchaKetana: "16:29:00-07:00", plagHamincha: "17:42:00-07:00", sunset: "18:55:00-07:00", tzeis: "19:32:00-07:00" } },
  { loc: 'la', date: '2026-06-21', times: {
    alos: "04:10:00-07:00", sunrise: "05:42:00-07:00", sofZmanShma: "09:18:00-07:00", sofZmanTefila: "10:31:00-07:00", chatzos: "12:55:00-07:00", minchaGedola: "13:31:00-07:00", minchaKetana: "17:07:00-07:00", plagHamincha: "18:37:00-07:00", sunset: "20:08:00-07:00", tzeis: "20:52:00-07:00" } },
  { loc: 'la', date: '2026-10-09', times: {
    alos: "05:40:00-07:00", sunrise: "06:54:00-07:00", sofZmanShma: "09:47:00-07:00", sofZmanTefila: "10:44:00-07:00", chatzos: "12:40:00-07:00", minchaGedola: "13:09:00-07:00", minchaKetana: "16:02:00-07:00", plagHamincha: "17:14:00-07:00", sunset: "18:26:00-07:00", tzeis: "19:03:00-07:00" } },
  { loc: 'la', date: '2026-11-01', times: {
    alos: "04:57:00-08:00", sunrise: "06:13:00-08:00", sofZmanShma: "08:54:00-08:00", sofZmanTefila: "09:48:00-08:00", chatzos: "11:36:00-08:00", minchaGedola: "12:03:00-08:00", minchaKetana: "14:45:00-08:00", plagHamincha: "15:52:00-08:00", sunset: "17:00:00-08:00", tzeis: "17:38:00-08:00" } },
  { loc: 'la', date: '2026-12-21', times: {
    alos: "05:35:00-08:00", sunrise: "06:55:00-08:00", sofZmanShma: "09:23:00-08:00", sofZmanTefila: "10:12:00-08:00", chatzos: "11:51:00-08:00", minchaGedola: "12:16:00-08:00", minchaKetana: "14:44:00-08:00", plagHamincha: "15:46:00-08:00", sunset: "16:48:00-08:00", tzeis: "17:29:00-08:00" } },
  { loc: 'lon', date: '2026-03-29', times: {
    alos: "05:00:00+01:00", sunrise: "06:43:00+01:00", sofZmanShma: "09:54:00+01:00", sofZmanTefila: "10:58:00+01:00", chatzos: "13:06:00+01:00", minchaGedola: "13:38:00+01:00", minchaKetana: "16:49:00+01:00", plagHamincha: "18:09:00+01:00", sunset: "19:29:00+01:00", tzeis: "20:19:00+01:00" } },
  { loc: 'lon', date: '2026-06-21', times: {
    alos: null, sunrise: "04:43:00+01:00", sofZmanShma: "08:53:00+01:00", sofZmanTefila: "10:16:00+01:00", chatzos: "13:02:00+01:00", minchaGedola: "13:44:00+01:00", minchaKetana: "17:54:00+01:00", plagHamincha: "19:38:00+01:00", sunset: "21:22:00+01:00", tzeis: "22:36:00+01:00" } },
  { loc: 'lon', date: '2026-10-25', times: {
    alos: "05:02:00+00:00", sunrise: "06:42:00+00:00", sofZmanShma: "09:13:00+00:00", sofZmanTefila: "10:03:00+00:00", chatzos: "11:44:00+00:00", minchaGedola: "12:09:00+00:00", minchaKetana: "14:41:00+00:00", plagHamincha: "15:44:00+00:00", sunset: "16:47:00+00:00", tzeis: "17:37:00+00:00" } },
  { loc: 'lon', date: '2026-12-21', times: {
    alos: "06:12:00+00:00", sunrise: "08:04:00+00:00", sofZmanShma: "10:01:00+00:00", sofZmanTefila: "10:40:00+00:00", chatzos: "11:59:00+00:00", minchaGedola: "12:18:00+00:00", minchaKetana: "14:16:00+00:00", plagHamincha: "15:05:00+00:00", sunset: "15:53:00+00:00", tzeis: "16:52:00+00:00" } },
  { loc: 'mel', date: '2026-04-05', times: {
    alos: "05:20:00+10:00", sunrise: "06:37:00+10:00", sofZmanShma: "09:30:00+10:00", sofZmanTefila: "10:28:00+10:00", chatzos: "12:23:00+10:00", minchaGedola: "12:51:00+10:00", minchaKetana: "15:44:00+10:00", plagHamincha: "16:56:00+10:00", sunset: "18:08:00+10:00", tzeis: "18:47:00+10:00" } },
  { loc: 'mel', date: '2026-06-21', times: {
    alos: "06:11:00+10:00", sunrise: "07:36:00+10:00", sofZmanShma: "09:59:00+10:00", sofZmanTefila: "10:46:00+10:00", chatzos: "12:22:00+10:00", minchaGedola: "12:46:00+10:00", minchaKetana: "15:09:00+10:00", plagHamincha: "16:08:00+10:00", sunset: "17:08:00+10:00", tzeis: "17:51:00+10:00" } },
  { loc: 'mel', date: '2026-10-04', times: {
    alos: "05:33:00+11:00", sunrise: "06:52:00+11:00", sofZmanShma: "10:01:00+11:00", sofZmanTefila: "11:03:00+11:00", chatzos: "13:09:00+11:00", minchaGedola: "13:41:00+11:00", minchaKetana: "16:50:00+11:00", plagHamincha: "18:08:00+11:00", sunset: "19:27:00+11:00", tzeis: "20:06:00+11:00" } },
  { loc: 'mel', date: '2026-12-21', times: {
    alos: "04:14:00+11:00", sunrise: "05:54:00+11:00", sofZmanShma: "09:36:00+11:00", sofZmanTefila: "10:50:00+11:00", chatzos: "13:18:00+11:00", minchaGedola: "13:55:00+11:00", minchaKetana: "17:37:00+11:00", plagHamincha: "19:09:00+11:00", sunset: "20:42:00+11:00", tzeis: "21:29:00+11:00" } },
  { loc: 'ny', date: '2026-03-08', times: {
    alos: "05:58:00-04:00", sunrise: "07:19:00-04:00", sofZmanShma: "10:13:00-04:00", sofZmanTefila: "11:11:00-04:00", chatzos: "13:07:00-04:00", minchaGedola: "13:36:00-04:00", minchaKetana: "16:30:00-04:00", plagHamincha: "17:42:00-04:00", sunset: "18:55:00-04:00", tzeis: "19:35:00-04:00" } },
  { loc: 'ny', date: '2026-06-21', times: {
    alos: "03:36:00-04:00", sunrise: "05:25:00-04:00", sofZmanShma: "09:11:00-04:00", sofZmanTefila: "10:27:00-04:00", chatzos: "12:58:00-04:00", minchaGedola: "13:35:00-04:00", minchaKetana: "17:22:00-04:00", plagHamincha: "18:56:00-04:00", sunset: "20:30:00-04:00", tzeis: "21:21:00-04:00" } },
  { loc: 'ny', date: '2026-10-09', times: {
    alos: "05:40:00-04:00", sunrise: "07:01:00-04:00", sofZmanShma: "09:52:00-04:00", sofZmanTefila: "10:49:00-04:00", chatzos: "12:43:00-04:00", minchaGedola: "13:11:00-04:00", minchaKetana: "16:02:00-04:00", plagHamincha: "17:13:00-04:00", sunset: "18:25:00-04:00", tzeis: "19:05:00-04:00" } },
  { loc: 'ny', date: '2026-11-01', times: {
    alos: "05:04:00-05:00", sunrise: "06:26:00-05:00", sofZmanShma: "09:03:00-05:00", sofZmanTefila: "09:55:00-05:00", chatzos: "11:39:00-05:00", minchaGedola: "12:05:00-05:00", minchaKetana: "14:42:00-05:00", plagHamincha: "15:47:00-05:00", sunset: "16:52:00-05:00", tzeis: "17:34:00-05:00" } },
  { loc: 'ny', date: '2026-12-21', times: {
    alos: "05:48:00-05:00", sunrise: "07:16:00-05:00", sofZmanShma: "09:35:00-05:00", sofZmanTefila: "10:21:00-05:00", chatzos: "11:54:00-05:00", minchaGedola: "12:17:00-05:00", minchaKetana: "14:36:00-05:00", plagHamincha: "15:34:00-05:00", sunset: "16:32:00-05:00", tzeis: "17:17:00-05:00" } },
];

// Hebcal /shabbat (M=on → havdalah at tzeit 8.5°; m=50 → 50 min after sunset), week of 2026-10-09.
const HEBCAL_SHABBAT = [
  { loc: 'ny', opts: {}, candles: '2026-10-09T18:06:00-04:00', havdalah: '2026-10-10T19:04:00-04:00' },
  { loc: 'ny', opts: { shabbosEnds: { type: 'minutes', value: 50 } }, candles: '2026-10-09T18:06:00-04:00', havdalah: '2026-10-10T19:13:00-04:00' },
  { loc: 'jer', opts: {}, candles: '2026-10-09T17:34:00+03:00', havdalah: '2026-10-10T18:49:00+03:00' },
];

const TOL_MIN = 2;
// Hebcal publishes plain-GRA times with 16.1° alos / 8.5° tzeis; compare like with like.
const HEBCAL_OPTS = { dayDegrees: 'sunrise', alosDegrees: 16.1, tzeisDegrees: 8.5 };
const fmt = (d, tz) => d ? d.toLocaleTimeString('en-GB', { timeZone: tz }) : 'null';
const ymdOf = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };

// ---------------------------------------------------------------------------
section('1a. Accuracy vs chabad.org (default options)');
{
  const tzMin = (ms, tz) => { const [h, m, sec] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ms)).split(':').map(Number); return h * 60 + m + sec / 60; };
  const stats = {};
  let exact = 0, total = 0;
  for (const [id, date, line] of CHABAD) {
    const loc = CHABAD_LOCS[id];
    const z = zmanim(ymdOf(date), loc);
    const vals = line.split(' ');
    CHABAD_KEYS.forEach((k, i) => {
      const v = vals[i];
      if (k === 'shaah') {
        const [mm, ss] = v.split(':').map(Number);
        const ours = (+z.plagHamincha - +z.sofZmanShma) / 7.75 / 1000; // one shaah zmanis, seconds
        const e = ours - (mm * 60 + ss);
        (stats.shaahSeconds ||= []).push(e);
        check(Math.abs(e) <= 3, `chabad ${id} ${date} shaah zmanis ours ${ours.toFixed(1)}s vs ${v}`);
        return;
      }
      if (v === '-') {
        if (k === 'candleLighting' || k === 'shabbosEnds') check(z[k] === null, `chabad ${id} ${date} ${k} should be null`);
        return;
      }
      const [h, m] = v.split(':').map(Number);
      if (!z[k]) { check(false, `chabad ${id} ${date} ${k}: got null, expected ${v}`); return; }
      const e = tzMin(+z[k], loc.tz) - (h * 60 + m);
      (stats[k] ||= []).push(e);
      check(Math.abs(e) <= 1.5, `chabad ${id} ${date} ${k}: ours ${fmt(z[k], loc.tz)} vs chabad ${v} (${e.toFixed(2)} min)`);
      const r = roundZman(z[k], k);
      total++;
      if (Math.round(tzMin(+r, loc.tz)) === h * 60 + m) exact++;
    });
  }
  console.log('key             n   mean(ours-chabad)  max|diff|   (minutes; chabad shows whole minutes)');
  for (const [k, a] of Object.entries(stats)) {
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    const unit = k === 'shaahSeconds' ? 's' : 'm';
    console.log(`${k.padEnd(15)} ${String(a.length).padStart(2)}   ${mean.toFixed(2).padStart(6)}${unit}            ${Math.max(...a.map(Math.abs)).toFixed(2)}${unit}`);
  }
  console.log(`roundZman() reproduces the exact displayed minute for ${exact}/${total} values (${(100 * exact / total).toFixed(1)}%)`);
  check(exact / total >= 0.9, `roundZman exact-match rate ${exact}/${total}`);
}

section('1b. Accuracy vs Hebcal (GRA options: ' + JSON.stringify(HEBCAL_OPTS) + ')');
const keys = ['alos', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'minchaGedola', 'minchaKetana', 'plagHamincha', 'sunset', 'tzeis'];
let maxDiff = 0, nCompared = 0;
const rows = [];
for (const fx of HEBCAL) {
  const loc = LOCS[fx.loc];
  const z = zmanim(ymdOf(fx.date), loc, HEBCAL_OPTS);
  const diffs = [];
  for (const k of keys) {
    const ref = fx.times[k];
    if (ref === null) {
      check(z[k] === null, `${fx.loc} ${fx.date} ${k}: expected null (event does not occur), got ${fmt(z[k], loc.tz)}`);
      diffs.push(`${k}=null`);
      continue;
    }
    const refMs = Date.parse(`${fx.date}T${ref}`);
    if (!z[k]) { check(false, `${fx.loc} ${fx.date} ${k}: got null, expected ${ref}`); continue; }
    const diff = (z[k] - refMs) / 60000;
    nCompared++;
    maxDiff = Math.max(maxDiff, Math.abs(diff));
    check(Math.abs(diff) <= TOL_MIN, `${fx.loc} ${fx.date} ${k}: ours ${fmt(z[k], loc.tz)} vs hebcal ${ref} (diff ${diff.toFixed(2)} min)`);
    diffs.push(Math.abs(diff));
  }
  const nums = diffs.filter((x) => typeof x === 'number');
  rows.push(`${fx.loc.padEnd(4)} ${fx.date}  netz ${fmt(z.sunrise, loc.tz)}  shkiah ${fmt(z.sunset, loc.tz)}  max|Δ| ${Math.max(...nums).toFixed(2)} min${diffs.some((x) => typeof x === 'string') ? '  (alos null, matches hebcal)' : ''}`);
}
console.log(rows.join('\n'));
console.log(`compared ${nCompared} values, max |diff| = ${maxDiff.toFixed(2)} min (tolerance ±${TOL_MIN})`);

for (const s of HEBCAL_SHABBAT) {
  const loc = LOCS[s.loc];
  const fri = zmanim({ y: 2026, m: 10, d: 9 }, loc, s.opts);
  const sat = zmanim({ y: 2026, m: 10, d: 10 }, loc, s.opts);
  const dc = (fri.candleLighting - Date.parse(s.candles)) / 60000;
  const dh = (sat.shabbosEnds - Date.parse(s.havdalah)) / 60000;
  console.log(`shabbat ${s.loc} ${JSON.stringify(s.opts)}: candles ${fmt(fri.candleLighting, loc.tz)} (Δ ${dc.toFixed(2)}), ends ${fmt(sat.shabbosEnds, loc.tz)} (Δ ${dh.toFixed(2)})`);
  check(Math.abs(dc) <= TOL_MIN, `${s.loc} candle lighting diff ${dc}`);
  check(Math.abs(dh) <= TOL_MIN, `${s.loc} shabbos ends diff ${dh}`);
  check(fri.shabbosEnds === null && sat.candleLighting === null, `${s.loc} candleLighting only Fri / shabbosEnds only Sat`);
}

// ---------------------------------------------------------------------------
section('2. API shape & helpers');
check(DEFAULTS.candleMinutes === 18 && DEFAULTS.tzeisDegrees === 6 && DEFAULTS.alosDegrees === 16.9
  && DEFAULTS.misheyakirDegrees === 10.2 && DEFAULTS.dayDegrees === 1.583 && Object.keys(CHABAD_ROUNDING).length === 13 && DEFAULTS.shabbosEnds.type === 'degrees' && DEFAULTS.shabbosEnds.value === 8.5, 'DEFAULTS');
for (const k of ['alos', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'minchaGedola', 'minchaKetana', 'plagHamincha', 'sunset', 'tzeis', 'candleLighting', 'shabbosEnds']) {
  check(typeof ZMANIM_LABELS[k] === 'string', `label for ${k}`);
}
check(ZMANIM_LABELS.sunrise === 'Netz' && ZMANIM_LABELS.sunset === 'Shkiah' && ZMANIM_LABELS.candleLighting === 'Candle lighting', 'label text');
// 2026-10-10T02:30Z is still Oct 9 (Fri) in New York but Oct 10 (Sat) in Tokyo/Jerusalem.
const inst = new Date('2026-10-10T02:30:00Z');
const l1 = localYMD(inst, 'America/New_York');
check(l1.y === 2026 && l1.m === 10 && l1.d === 9 && l1.weekday === 5, `localYMD NY ${JSON.stringify(l1)}`);
const l2 = localYMD(inst, 'Asia/Jerusalem');
check(l2.d === 10 && l2.weekday === 6, `localYMD Jerusalem ${JSON.stringify(l2)}`);
// DST fall-back day: 2026-11-01 01:30 EST (second occurrence) is 06:30Z.
const l3 = localYMD(new Date('2026-11-01T06:30:00Z'), 'America/New_York');
check(l3.d === 1 && l3.weekday === 0, `localYMD NY DST end ${JSON.stringify(l3)}`);
// sunTimes on DST days lands on the requested local date.
for (const [k, ds] of [['ny', '2026-03-08'], ['ny', '2026-11-01'], ['lon', '2026-10-25'], ['mel', '2026-04-05']]) {
  const st = sunTimes(ymdOf(ds), LOCS[k]);
  for (const f of ['sunrise', 'sunset', 'solarNoon']) {
    const l = localYMD(st[f], LOCS[k].tz);
    check(`${l.y}-${String(l.m).padStart(2, '0')}-${String(l.d).padStart(2, '0')}` === ds, `${k} ${ds} ${f} on the right local date`);
  }
}
// sunPosition: altitude ≈ -0.833° at computed sunset (apparent, i.e. ≈ 0° upper limb), high at noon.
{
  const st = sunTimes({ y: 2026, m: 6, d: 21 }, LOCS.jer);
  const p = sunPosition(st.solarNoon, LOCS.jer);
  check(Math.abs(p.altitude - (90 - 31.778 + 23.43)) < 0.3, `Jerusalem noon altitude ${p.altitude}`);
  check(p.azimuth > 170 && p.azimuth < 190 || p.azimuth < 10 || p.azimuth > 350, `Jerusalem noon azimuth ${p.azimuth}`);
  const ps = sunPosition(st.sunset, LOCS.jer);
  check(Math.abs(ps.altitude) < 0.6 && ps.azimuth > 290 && ps.azimuth < 305, `Jerusalem sunset alt/az ${ps.altitude}/${ps.azimuth}`);
  const pr = sunPosition(st.sunrise, LOCS.jer);
  check(pr.azimuth > 55 && pr.azimuth < 70, `Jerusalem sunrise az ${pr.azimuth}`);
}
// Elevation makes sunrise earlier and sunset later.
{
  const a = sunTimes({ y: 2026, m: 10, d: 9 }, LOCS.jer);
  const b = sunTimes({ y: 2026, m: 10, d: 9 }, { ...LOCS.jer, elevation: 800 });
  check(b.sunrise < a.sunrise && b.sunset > a.sunset, 'elevation widens the day');
}
// opts overrides
{
  const d = { y: 2026, m: 10, d: 9 };
  check(+zmanim(d, LOCS.ny, { candleMinutes: 40 }).candleLighting === +zmanim(d, LOCS.ny).sunset - 40 * 60000, 'candleMinutes opt');
  check(+zmanim(d, { ...LOCS.ny, candleMinutes: 22 }).candleLighting === +zmanim(d, LOCS.ny).sunset - 22 * 60000, 'loc.candleMinutes');
  const s = { y: 2026, m: 10, d: 10 };
  check(+zmanim(s, LOCS.ny, { shabbosEnds: { type: 'minutes', value: 72 } }).shabbosEnds === +zmanim(s, LOCS.ny).sunset + 72 * 60000, 'shabbosEnds minutes opt');
  check(zmanim(s, LOCS.ny, { tzeisDegrees: 8.5 }).tzeis > zmanim(s, LOCS.ny).tzeis, 'tzeisDegrees opt');
  check(zmanim(s, LOCS.ny, { alosDegrees: 19.8 }).alos < zmanim(s, LOCS.ny).alos, 'alosDegrees opt');
  check(zmanim(s, LOCS.ny, { misheyakirDegrees: 11 }).misheyakir < zmanim(s, LOCS.ny).misheyakir, 'misheyakirDegrees opt');
  { // dayDegrees: 'sunrise' = plain GRA (visible sunrise→sunset); default Baal HaTanya day is longer
    const g = zmanim(s, LOCS.ny, { dayDegrees: 'sunrise' }), b = zmanim(s, LOCS.ny);
    check(Math.abs(+g.sofZmanShma - (+g.sunrise + 3 * (g.sunset - g.sunrise) / 12)) < 2, 'GRA sof zman shma = sunrise + 3h');
    check(b.sofZmanShma < g.sofZmanShma && b.plagHamincha > g.plagHamincha, 'Baal HaTanya day vs GRA day');
  }
  check(+roundZman(new Date('2026-10-09T13:30:20Z'), 'sofZmanShma') === Date.parse('2026-10-09T13:30:00Z')
    && +roundZman(new Date('2026-10-09T13:30:20Z'), 'tzeis') === Date.parse('2026-10-09T13:31:00Z')
    && +roundZman(new Date('2026-10-09T13:30:40Z'), 'sunset') === Date.parse('2026-10-09T13:31:00Z')
    && roundZman(null, 'alos') === null, 'roundZman directions');
}

// ---------------------------------------------------------------------------
section('3. nextZman');
{
  const ny = LOCS.ny;
  const fri = zmanim({ y: 2026, m: 10, d: 9 }, ny);
  const sat = zmanim({ y: 2026, m: 10, d: 10 }, ny);
  const sun = zmanim({ y: 2026, m: 10, d: 11 }, ny);
  const mon = zmanim({ y: 2026, m: 10, d: 12 }, ny);

  let n = nextZman(new Date('2026-10-09T15:00:00-04:00'), ny); // Fri 3pm
  check(n && n.key === 'candleLighting' && n.label === 'Candle lighting' && +n.at === +fri.candleLighting, `Fri afternoon -> ${JSON.stringify(n)}`);
  console.log('Fri 15:00 ->', n.label, fmt(n.at, ny.tz));

  n = nextZman(new Date('2026-10-09T08:00:00-04:00'), ny); // Fri morning: still candle lighting by priority
  check(n && n.key === 'candleLighting', `Fri morning -> ${n && n.key}`);

  n = nextZman(new Date(+fri.candleLighting + 60000), ny); // Fri after candle lighting
  check(n && n.key === 'shabbosEnds' && n.label === 'Shabbos ends' && +n.at === +sat.shabbosEnds, `Fri after candles -> ${JSON.stringify(n)}`);
  console.log('Fri after candles ->', n.label, fmt(n.at, ny.tz));

  n = nextZman(new Date('2026-10-09T23:30:00-04:00'), ny); // Fri late night
  check(n && n.key === 'shabbosEnds', `Fri 23:30 -> ${n && n.key}`);
  n = nextZman(new Date('2026-10-10T10:00:00-04:00'), ny); // Sat morning
  check(n && n.key === 'shabbosEnds' && +n.at === +sat.shabbosEnds, `Sat morning -> ${n && n.key}`);

  n = nextZman(new Date(+sat.shabbosEnds + 60000), ny); // Sat after Shabbos
  check(n && n.key === 'alos' && n.label === 'Alos Hashachar' && +n.at === +sun.alos, `Sat after shabbos -> ${JSON.stringify(n)}`);
  console.log('Sat after Shabbos ->', n.label, fmt(n.at, ny.tz), localYMD(n.at, ny.tz));

  n = nextZman(new Date(+sat.shabbosEnds + 60000), ny, { shabbosEnds: { type: 'minutes', value: 42 } });
  check(n && n.key === 'shabbosEnds', `Sat 1 min after 8.5° but before 42-min method -> ${n && n.key}`);

  n = nextZman(new Date('2026-10-12T05:00:00-04:00'), ny); // Mon before alos
  check(n && n.key === 'alos' && +n.at === +mon.alos, `Mon 05:00 -> ${n && n.key}`);
  n = nextZman(new Date(+mon.alos + 60000), ny); // Mon between alos and netz
  check(n && n.key === 'sunrise' && n.label === 'Netz', `Mon after alos -> ${n && n.key}`);
  n = nextZman(new Date(+mon.misheyakir + 60000), ny);
  check(n && n.key === 'sunrise', `misheyakir skipped -> ${n && n.key}`);
  n = nextZman(new Date(+mon.minchaGedola + 60000), ny);
  check(n && n.key === 'plagHamincha', `minchaKetana skipped -> ${n && n.key}`);
  n = nextZman(new Date(+mon.tzeis + 60000), ny); // Mon night -> Tue alos
  const tue = zmanim({ y: 2026, m: 10, d: 13 }, ny);
  check(n && n.key === 'alos' && +n.at === +tue.alos, `Mon night -> ${n && n.key}`);

  // Sequence on a weekday walks through the regular list in order.
  const seq = [];
  let t = new Date('2026-10-12T00:30:00-04:00');
  for (let i = 0; i < 9; i++) { const r = nextZman(t, ny); seq.push(r.key); t = new Date(+r.at + 1000); }
  check(seq.join() === 'alos,sunrise,sofZmanShma,sofZmanTefila,chatzos,minchaGedola,plagHamincha,sunset,tzeis', `weekday sequence ${seq}`);

  // Location tz, not device tz: 2026-10-10T02:30Z is Fri evening in NY (after candles) but Sat in Tokyo.
  n = nextZman(new Date('2026-10-10T02:30:00Z'), ny);
  check(n && n.key === 'shabbosEnds' && +n.at === +sat.shabbosEnds, `tz independence (NY Fri night) -> ${n && n.key}`);
  // Jerusalem: 2026-10-09T13:00Z = 16:00 IDT Fri, before 40-min candle lighting.
  n = nextZman(new Date('2026-10-09T13:00:00Z'), LOCS.jer);
  check(n && n.key === 'candleLighting', `Jerusalem Fri 16:00 -> ${n && n.key}`);
  console.log('Jerusalem Fri 16:00 ->', n.label, fmt(n.at, LOCS.jer.tz));
  // Melbourne: 2026-10-09T13:00Z is Sat 00:00 AEDT -> Shabbos ends.
  n = nextZman(new Date('2026-10-09T13:00:00Z'), LOCS.mel);
  check(n && n.key === 'shabbosEnds' && localYMD(n.at, LOCS.mel.tz).weekday === 6, `Melbourne Sat 00:00 -> ${n && n.key}`);
}

// ---------------------------------------------------------------------------
section('4. Polar edge cases');
{
  const tromso = { lat: 69.65, lon: 18.96, tz: 'Europe/Oslo' };
  let st, z, n;
  try {
    st = sunTimes({ y: 2026, m: 6, d: 21 }, tromso);
    z = zmanim({ y: 2026, m: 6, d: 21 }, tromso);
    n = nextZman(new Date('2026-06-21T10:00:00Z'), tromso);
    check(true, 'no throw');
  } catch (e) { check(false, `Tromsø threw: ${e.stack}`); }
  check(st.sunrise === null && st.sunset === null && st.solarNoon instanceof Date, `Tromsø summer sunTimes ${JSON.stringify(st)}`);
  check(z.sunrise === null && z.sunset === null && z.alos === null && z.tzeis === null && z.sofZmanShma === null && z.plagHamincha === null, 'Tromsø summer zmanim null');
  // Only chatzos (falls back to solar transit) exists on a polar day.
  check(n === null || n.key === 'chatzos', `Tromsø summer nextZman -> ${JSON.stringify(n)}`);
  console.log('Tromsø 2026-06-21:', JSON.stringify(st), 'nextZman:', n);
  const w = sunTimes({ y: 2026, m: 12, d: 21 }, tromso); // polar night
  check(w.sunrise === null && w.sunset === null, 'Tromsø winter polar night null');
  const z2 = zmanim({ y: 2026, m: 6, d: 26 }, tromso);
  check(z2.candleLighting === null, 'Tromsø Friday with no sunset -> candleLighting null');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
