// Builds public/data. Responses are cached in .cache so sources are hit once; delete it to refresh.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { isGeostationary, makeSatrec, subLongitude } from '../src/orbit.js';
import { matchSatellite, nameKeys, parseBeaconTable, parseTransponders, validateTransponders } from './parse-plans.mjs';

const FPS = 'http://frequencyplansatellites.altervista.org/';
const REGIONS = ['Asia', 'Europe-Africa-MiddleEast', 'Atlantic', 'Americas'];
const OMM_FIELDS = ['OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE', 'CLASSIFICATION_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];
const root = new URL('../../', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cached(url) {
  const file = new URL(`.cache/${createHash('sha1').update(url).digest('hex')}`, root);
  try { return await readFile(file); } catch {}
  await sleep(400);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(file, body);
  return body;
}

// Page-space bounding boxes of drawn paths, following the graphics transform stack.
function pageRects({ fnArray, argsArray }) {
  const rects = [], stack = [];
  let m = [1, 0, 0, 1, 0, 0];
  const apply = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  fnArray.forEach((fn, i) => {
    const a = argsArray[i];
    if (fn === OPS.save) stack.push(m);
    else if (fn === OPS.restore) m = stack.pop() ?? m;
    else if (fn === OPS.transform) {
      const [p, q, r, s, t, u] = a;
      m = [m[0] * p + m[2] * q, m[1] * p + m[3] * q, m[0] * r + m[2] * s, m[1] * r + m[3] * s, m[0] * t + m[2] * u + m[4], m[1] * t + m[3] * u + m[5]];
    } else if (fn === OPS.constructPath) {
      const box = a[2];
      if (!box || box.length < 4 || !Number.isFinite(box[0])) return;
      const [x0, y0] = apply(box[0], box[1]), [x1, y1] = apply(box[2], box[3]);
      rects.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
    }
  });
  return rects;
}

async function pdfItems(buf) {
  const task = getDocument({ data: new Uint8Array(buf), verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    pages.push({
      items: items.filter((i) => i.str?.trim()).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], rotated: Math.abs(i.transform[1]) > Math.abs(i.transform[0]) })),
      rects: pageRects(await page.getOperatorList()),
    });
  }
  await task.destroy();
  return pages;
}

await mkdir(new URL('.cache/', root), { recursive: true });
await mkdir(new URL('public/data/', root), { recursive: true });
const save = (name, data) => writeFile(new URL(`public/data/${name}`, root), JSON.stringify(data));
const aliases = await readFile(new URL('public/data/aliases.json', root), 'utf8').then(JSON.parse).catch(() => ({}));

const sats = JSON.parse(await cached('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'))
  .map((o) => Object.fromEntries(OMM_FIELDS.map((k) => [k, o[k]])));
// Rows instead of objects: repeating 17 keys across 17k satellites is most of the file.
await save('sats.json', { fields: OMM_FIELDS, rows: sats.map((s) => OMM_FIELDS.map((k) => s[k])) });
const now = new Date();
const catalog = sats.filter(isGeostationary).map((o) => ({
  norad: o.NORAD_CAT_ID, keys: nameKeys(o.OBJECT_NAME), lon: subLongitude(makeSatrec(o), now),
}));
console.log(`catalog: ${sats.length} satellites, ${catalog.length} geostationary`);

const transmitters = {};
for (const t of JSON.parse(await cached('https://db.satnogs.org/api/transmitters/?format=json'))) {
  if (!t.alive || t.status !== 'active' || !t.downlink_low || !t.norad_cat_id) continue;
  (transmitters[t.norad_cat_id] ??= []).push({ freqMHz: t.downlink_low / 1e6, mode: t.mode, description: t.description });
}
await save('transmitters.json', transmitters);
console.log(`satnogs: ${Object.keys(transmitters).length} satellites with active downlinks`);

const home = (await cached(FPS)).toString('utf8');
const pdfLinks = new Map();
const collectPdfs = (html) => {
  for (const [, href, label] of html.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    pdfLinks.set(new URL(href, FPS).href, label.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
  }
};
collectPdfs(home);
const operators = [...new Set([...home.matchAll(/href=["'](http:\/\/frequencyplansatellites\.altervista\.org\/[^"'/]+\.html)["']/gi)].map((m) => m[1]))]
  .filter((u) => !/Beacon-Telemetry|Esperimenti|index\.html/i.test(u));
for (const url of operators) {
  try { collectPdfs((await cached(url)).toString('utf8')); } catch (e) { console.log(`operator page failed: ${url} ${e.message}`); }
}
const plans = {}, unmatched = [], rows = [];
for (const region of REGIONS) {
  rows.push(...parseBeaconTable((await cached(`${FPS}Beacon-Telemetry_${region}.html`)).toString('utf8')));
}
for (const row of rows) {
  if (!row.beacons.length) continue;
  const norad = matchSatellite(row, catalog, aliases);
  if (!norad) { unmatched.push(`${row.lon} ${row.name}`); continue; }
  const plan = (plans[norad] ??= { name: row.name, url: row.url ?? FPS, beacons: [] });
  for (const b of row.beacons) if (!plan.beacons.some((x) => x.freqMHz === b.freqMHz)) plan.beacons.push(b);
}
await save('beacons.json', plans);
console.log(`beacon rows: ${rows.filter((r) => r.beacons.length).length}, matched satellites: ${Object.keys(plans).length}, unmatched rows: ${unmatched.length}`);
console.log(unmatched.join('\n'));

const transponders = {}, rejected = [], noMatch = [];
console.log(`transponder PDFs linked: ${pdfLinks.size}`);
for (const [url, label] of pdfLinks) {
  const base = decodeURIComponent(url.split('/').pop()).replace(/\.pdf$/i, '').replace(/_New$/i, '').replace(/_/g, ' ');
  const norad = matchByPdfName(label) ?? matchByPdfName(base);
  if (!norad) { noMatch.push(base); continue; }
  try {
    const list = validateTransponders((await pdfItems(await cached(url))).flatMap(({ items, rects }, page) => parseTransponders(items, rects).map((t) => ({ ...t, row: `${page}:${t.row}` }))));
    if (list) transponders[norad] = list; else rejected.push(base);
  } catch (e) { rejected.push(`${base} (${e.message})`); }
}
await save('transponders.json', transponders);
console.log(`transponder plans: ${Object.keys(transponders).length}, rejected: ${rejected.length}, no satellite match: ${noMatch.length}`);
console.log('rejected:', rejected.join(', '));
console.log('no match:', noMatch.join(', '));

function matchByPdfName(name) {
  if (aliases[name]) return aliases[name];
  const keys = new Set(nameKeys(name));
  // The beacon tables already resolved names by longitude, so trust them first.
  const planned = Object.entries(plans).filter(([, p]) => nameKeys(p.name).some((k) => keys.has(k)));
  if (planned.length === 1) return +planned[0][0];
  const hits = catalog.filter((s) => s.keys.some((k) => keys.has(k)));
  return hits.length === 1 ? hits[0].norad : null;
}
