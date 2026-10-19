/* ==========================================================================
   SZVTECH — the tools list (single source of truth)

   The homepage "Tools" section, the mobile menu chips, the footer row and the
   terminal (`tools`, plus one command per tool) are all rendered from this
   array. Adding a page = adding one line here. Flipping `live` to true moves a
   tool from the "on the bench" row into the grid, the menu, the footer and
   the terminal.

   Fields
     id     short name; also the terminal command (must be a-z0-9)
     path   absolute URL of the page
     name   display name
     blurb  one line, shown on the card and in `help`
     icon   key into ICONS below (inline SVG, 24x24, stroke = currentColor)
     tag    optional tiny mono label on the card (e.g. a place)
     demo   optional lines the card cycles through as its live element
     related  ids of tools to show first in the "More tools" strip on this page
     featured true = big card on the homepage (the rest are the compact grid)
     live   true = in the grid and linked; false = "soon" chip, not linked

   Hidden pages (hack, more, contact, sys) never go here.
   ========================================================================== */

export const TOOLS = [
  { id: 'time',    path: '/time/',    name: 'Time',    blurb: 'Exact clock, zmanim, bedside mode', icon: 'clock', live: true, featured: true, related: ['zmanim', 'luach', 'world', 'timer'] },
  { id: 'zmanim',  path: '/zmanim/',  name: 'Zmanim',  blurb: 'Today’s zmanim: timeline, sun arc & week (Chabad.org)', icon: 'sun', live: true, featured: true, related: ['luach', 'tehillim', 'time'] },
  { id: 'today',    path: '/today/',    name: 'Today',    blurb: 'Your day on one screen: time, zmanim, weather, reminders', icon: 'calendar', live: true, featured: true, related: ['remind', 'zmanim', 'weather'] },
  { id: 'notes',    path: '/notes/',    name: 'Notes',    blurb: 'Private notes & code pastes, with share-by-link editing', icon: 'note', live: true, featured: true, related: ['dev', 'url', 'qr'] },
  { id: 'remind',   path: '/remind/',   name: 'Remind',   blurb: 'Countdowns & reminders, by Hebrew date or zman', icon: 'timer', live: true, related: ['today', 'luach', 'timer'] },
  { id: 'luach',   path: '/luach/',   name: 'Luach',   blurb: 'Hebrew calendar, Shabbos times, daily study, date converter', icon: 'calendar', live: true, related: ['tehillim', 'gematria', 'zmanim'] },
  { id: 'weather', path: '/weather/', name: 'Weather', blurb: 'Now, hourly and 7 days for your saved city', icon: 'cloud', live: true },
  { id: 'timer',   path: '/timer/',   name: 'Timer',   blurb: 'Stopwatch, countdowns, focus', icon: 'timer', live: true, related: ['seder', 'time'] },
  { id: 'world',   path: '/world/',   name: 'World',   blurb: 'World clock & meeting planner', icon: 'globe', live: true },
  { id: 'qr',      path: '/qr/',      name: 'QR',      blurb: 'Make & scan, on your device', icon: 'qr', live: true, related: ['url', 'nfc'] },
  { id: 'convert', path: '/convert/', name: 'Convert', blurb: 'Type anything: 5 ft 11 in to cm', icon: 'convert', live: true, related: ['shiurim', 'maaser'],
    demo: ['5 ft 11 in → 180.3 cm', '72 °F → 22.2 °C', '1 cup → 236.6 ml', '26.2 mi → 42.16 km', '150 lb → 68.04 kg'] },
  { id: 'nfc',      path: '/nfc/',      name: 'NFC',      blurb: 'Read, write & lock NFC tags. Build a tap-to-share card', icon: 'nfc', live: true, featured: true, related: ['url', 'qr', 'convert'] },
  { id: 'url',      path: '/url/',      name: 'Links',    blurb: 'Your own short links: szvtech.org/url/anything', icon: 'link', live: true, related: ['qr', 'nfc'] },
  { id: 'gematria', path: '/gematria/', name: 'Gematria', blurb: 'Type a word, get its value & words that match', icon: 'gematria', live: true, related: ['hebtype', 'luach', 'tehillim'] },
  { id: 'hebtype',  path: '/hebtype/',  name: 'Hebrew Type', blurb: 'Nikud keyboard, Rashi script, transliteration', icon: 'keyboard', live: true, related: ['gematria', 'qr'] },
  { id: 'maaser',   path: '/maaser/',   name: 'Maaser',   blurb: 'Calculate & log giving, on your device only', icon: 'coin', live: true, related: ['convert', 'luach'] },
  { id: 'tehillim', path: '/tehillim/', name: 'Tehillim', blurb: 'Today’s chapters by the Hebrew date, with tracking', icon: 'book', live: true, related: ['luach', 'seder', 'zmanim'] },
  { id: 'seder',    path: '/seder/',    name: 'Seder',    blurb: 'Learning timer & streaks for every seder', icon: 'hourglass', live: true, related: ['timer', 'tehillim', 'luach'] },
  { id: 'shiurim',  path: '/shiurim/',  name: 'Shiurim',  blurb: 'Kzayis, revi’is & other measures in ml, oz, cm', icon: 'measure', live: true, related: ['convert', 'luach'] },
  { id: 'dev',     path: '/dev/',     name: 'Dev',     blurb: 'Encoders, hashes, little dev helpers', icon: 'code', live: true, related: ['qr', 'url', 'convert'] },
  { id: 'net',     path: '/net/',     name: 'Net Lab', blurb: 'Your IP, live ping, DNS, device info', icon: 'wifi', live: true },
  { id: 'sky',     path: '/sky/',     name: 'Sky',     blurb: 'The ISS live, passes, Moon & planets', icon: 'orbit', live: true },
];

export const liveTools = () => TOOLS.filter((t) => t.live);
export const soonTools = () => TOOLS.filter((t) => !t.live);

/* Line icons, drawn on a 24px grid, 1.6 stroke. Trusted constants (never user
   input), so they may be inserted as markup. */
const A = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
export const ICONS = {
  clock: `<svg ${A}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  timer: `<svg ${A}><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.5 7l1.5-1.5"/></svg>`,
  globe: `<svg ${A}><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z"/></svg>`,
  qr: `<svg ${A}><rect x="3.5" y="3.5" width="6" height="6" rx="1.2"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.2"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.2"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v.01M14.5 20.5h.01M17.5 20.5h3v-3"/></svg>`,
  convert: `<svg ${A}><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg>`,
  sun: `<svg ${A}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`,
  calendar: `<svg ${A}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
  code: `<svg ${A}><path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.2 5.5l-2.4 13"/></svg>`,
  wifi: `<svg ${A}><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.2" r=".6" fill="currentColor"/></svg>`,
  orbit: `<svg ${A}><circle cx="12" cy="12" r="3.2"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-25 12 12)"/><circle cx="19.6" cy="8.3" r=".9" fill="currentColor"/></svg>`,
  cloud: `<svg ${A}><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.6 4.5 4.5 0 0 0 7 18.5z"/></svg>`,
  nfc: `<svg ${A}><path d="M7 8.5a5 5 0 0 1 0 7M11 6a9 9 0 0 1 0 12M15 3.5a13 13 0 0 1 0 17"/></svg>`,
  link: `<svg ${A}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
  gematria: `<svg ${A}><path d="M4.5 8h15M4.5 12h15M4.5 16h15"/><circle cx="9" cy="8" r="1.7"/><circle cx="14.5" cy="12" r="1.7"/><circle cx="8" cy="16" r="1.7"/></svg>`,
  keyboard: `<svg ${A}><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>`,
  coin: `<svg ${A}><circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.3c-.6-.8-1.5-1.2-2.7-1.2-1.5 0-2.5.8-2.5 1.9 0 2.7 5.2 1.3 5.2 4 0 1.2-1.1 2-2.7 2-1.2 0-2.2-.5-2.8-1.3M12 6.5v1.6M12 16v1.5"/></svg>`,
  book: `<svg ${A}><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/></svg>`,
  hourglass: `<svg ${A}><path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 4 5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5-4 8.5s4 4.5 4 8.5"/></svg>`,
  measure: `<svg ${A}><path d="M5 6h14l-1.6 12.2a2 2 0 0 1-2 1.8H8.6a2 2 0 0 1-2-1.8zM5.8 11h12.4"/></svg>`,
  note: `<svg ${A}><path d="M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9 12.5h7M9 16h5"/></svg>`,
  tool: `<svg ${A}><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z"/></svg>`,
};
export const icon = (t) => ICONS[t.icon] || ICONS.tool;
