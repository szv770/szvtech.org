// /nfc — everything saved in this browser: library, recent writes, scan history, cards.
import { store, uid } from '/nfc/ui.js?v=8974ba5dc3';
import { itemRecords, summarize, decodeRecord, messageSize } from '/nfc/ndef.js?v=da5a737810';

const cap = (arr, n) => arr.slice(0, n);

export function itemsWeb(items) {
  let recs = [];
  for (const it of items) { try { recs = recs.concat(itemRecords(it)); } catch (e) { /* incomplete */ } }
  return recs;
}
export const labelFor = (items) => { const r = itemsWeb(items); return r.length ? summarize(r) : 'Empty'; };
export const bytesFor = (items) => { const r = itemsWeb(items); return r.length ? messageSize(r) : 0; };
export const kindsFor = (items) => itemsWeb(items).map((r) => decodeRecord(r).kind);

/* library (named presets) */
export const lib = {
  all: () => store.get('lib', []),
  add(name, items) { const l = lib.all(); const e = { id: uid(), name: String(name || '').trim().slice(0, 60) || labelFor(items), ts: Date.now(), items }; store.set('lib', cap([e, ...l], 100)); return e; },
  remove(id) { store.set('lib', lib.all().filter((x) => x.id !== id)); },
  rename(id, name) { store.set('lib', lib.all().map((x) => (x.id === id ? { ...x, name: String(name).trim().slice(0, 60) || x.name } : x))); },
};
/* recent writes */
export const recent = {
  all: () => store.get('recent', []),
  add(items, bytes) {
    const label = labelFor(items);
    const l = recent.all().filter((x) => x.label !== label);
    store.set('recent', cap([{ id: uid(), ts: Date.now(), label, bytes, items }, ...l], 12));
  },
  clear: () => store.set('recent', []),
};
/* scan history */
export const history = {
  all: () => store.get('history', []),
  add(e) {
    const l = history.all().filter((x) => !(x.serial && x.serial === e.serial && x.label === e.label));
    store.set('history', cap([e, ...l], 30));
  },
  clear: () => store.set('history', []),
};

/* backup */
export function exportAll() {
  return { app: 'szvtech-nfc', v: 1, exported: new Date().toISOString(), lib: lib.all(), recent: recent.all(), cards: store.get('cards', null) };
}
export function importAll(txt) {
  let o; try { o = JSON.parse(txt); } catch (e) { throw new Error('That isn’t valid backup text.'); }
  if (!o || o.app !== 'szvtech-nfc') throw new Error('That doesn’t look like an NFC Station backup.');
  let n = 0;
  if (Array.isArray(o.lib)) {
    const have = new Set(lib.all().map((x) => x.id));
    const add = o.lib.filter((x) => x && x.id && Array.isArray(x.items) && !have.has(x.id)).map((x) => ({ id: String(x.id), name: String(x.name || 'Imported').slice(0, 60), ts: +x.ts || Date.now(), items: x.items }));
    store.set('lib', cap([...add, ...lib.all()], 100)); n += add.length;
  }
  if (Array.isArray(o.recent)) { const add = o.recent.filter((x) => x && Array.isArray(x.items)); store.set('recent', cap([...add, ...recent.all()], 12)); }
  if (o.cards && Array.isArray(o.cards.list)) {
    const cur = store.get('cards', { cur: '', list: [] });
    const have = new Set(cur.list.map((x) => x.id));
    const add = o.cards.list.filter((x) => x && x.id && x.card && !have.has(x.id));
    store.set('cards', { cur: cur.cur || (add[0] && add[0].id) || '', list: [...cur.list, ...add].slice(0, 8) }); n += add.length;
  }
  return n;
}
