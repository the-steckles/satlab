// Parsers for frequencyplansatellites.altervista.org tables and PDF text.
import { bandOf } from '../src/frequencies.js';

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&deg;/g, '°').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function parseLongitude(s) {
  const m = s.match(/(\d+(?:[.,]\d+)?)\D*([EW])/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return m[2].toUpperCase() === 'W' ? -v : v;
}

// Cells look like "4197,25 L (WH or Global) or 4197,25 V (Global) / 11699,00 R".
export function parseBeaconCell(cell) {
  const found = new Map();
  const re = /(?<![\d,.])(\d{3,5}(?:[,.]\d+)?)(?:\s+([HVLR](?:\s+or\s+[HVLR])*)(?![A-Za-z]))?(?:\s*\(([^)]*)\))?/g;
  for (const [, f, pol, beam] of cell.matchAll(re)) {
    const freqMHz = parseFloat(f.replace(',', '.'));
    if (freqMHz < 100) continue;
    const entry = found.get(freqMHz) ?? { freqMHz, pols: new Set(), beams: new Set() };
    pol?.split(/\s+or\s+/).forEach((p) => entry.pols.add(p));
    beam?.split(/\s+or\s+/).forEach((b) => entry.beams.add(b.trim()));
    found.set(freqMHz, entry);
  }
  return [...found.values()].map((e) => ({ freqMHz: e.freqMHz, pol: [...e.pols].join('/'), beam: [...e.beams].join('/') }));
}

export function parseBeaconTable(html) {
  const out = [];
  for (const [row] of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
    if (cells.length < 3) continue;
    const lon = parseLongitude(text(cells[0]));
    if (lon === null) continue;
    const name = text(cells[1]);
    const url = cells[1].match(/href=["']([^"']+)["']/i)?.[1] ?? null;
    if (name) out.push({ lon, name, url, beacons: parseBeaconCell(text(cells[2])) });
  }
  return out;
}

export const normalizeName = (s) => s.toUpperCase().replace(/INTALSAT/g, 'INTELSAT').replace(/ZHONGXING/g, 'CHINASAT').replace(/\bIS[- ]?(?=\d)/g, 'INTELSAT').replace(/[^A-Z0-9]/g, '');

// Every name a satellite goes by: the main one plus anything in () or [].
export function nameKeys(name) {
  const cleaned = name.replace(/\(?\s*in[cl]+\w*\.?\s*orbit\s*\)?/gi, '');
  const parts = [cleaned.replace(/[([][^)\]]*[)\]]/g, ''), ...[...cleaned.matchAll(/[([]([^)\]]+)[)\]]/g)].map((m) => m[1])];
  return [...new Set(parts.flatMap((p) => p.split(/[/&]/)).map(normalizeName).filter((k) => k.length >= 3))];
}

const lonGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

export function matchSatellite(row, catalog, aliases = {}) {
  if (aliases[row.name]) return aliases[row.name];
  const keys = new Set(nameKeys(row.name));
  const hits = catalog.filter((s) => s.keys.some((k) => keys.has(k)) && s.lon !== null && lonGap(s.lon, row.lon) <= 1.5);
  if (!hits.length) return null;
  return hits.sort((a, b) => lonGap(a.lon, row.lon) - lonGap(b.lon, row.lon))[0].norad;
}

const POLS = { Vertical: 'V', Horizontal: 'H', RHCP: 'R', LHCP: 'L' };
const parseFreq = (s) => (/^\d{3,5},\d+$/.test(s) ? parseFloat(s.replace(',', '.')) : null);

const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

// MHz per page unit. Charts can skip part of the band, but their scale stays constant.
function chartScale(labels) {
  const pts = [...new Map(labels.map((l) => [l.centerMHz, l])).values()].sort((a, b) => a.x - b.x);
  const slopes = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    if (dx > 3) slopes.push(Math.abs(pts[i].centerMHz - pts[i - 1].centerMHz) / dx);
  }
  return slopes.length ? median(slopes) : null;
}

// items: [{ str, x, y, rotated }], rects: [{ x0, y0, x1, y1 }] for one page. Returns downlink transponders.
export function parseTransponders(items, rects = []) {
  const downlink = items.find((i) => i.str.trim() === 'Downlink');
  if (!downlink) return [];
  const below = items.filter((i) => i.y < downlink.y).map((i) => ({ ...i, str: i.str.trim() }));
  const pols = below.filter((i) => POLS[i.str]);
  if (!pols.length) return [];
  // A chart is a pair of adjacent polarization rows; its bandwidth labels sit anywhere around it.
  const charts = [];
  const sorted = [...pols].sort((a, b) => b.y - a.y);
  for (let i = 0; i < sorted.length; i++) {
    const paired = sorted[i + 1] && sorted[i].y - sorted[i + 1].y < 50;
    charts.push({ mid: paired ? (sorted[i].y + sorted[i + 1].y) / 2 : sorted[i].y });
    if (paired) i++;
  }
  const chartOf = (y) => charts.reduce((a, b) => (Math.abs(b.mid - y) < Math.abs(a.mid - y) ? b : a));
  const widths = below.filter((i) => !i.rotated && /^\d{1,4}$/.test(i.str) && +i.str >= 9 && +i.str <= 1000 && pols.every((p) => Math.abs(p.y - i.y) >= 8));
  const out = [];
  for (const label of below.filter((i) => i.rotated)) {
    const centerMHz = parseFreq(label.str);
    if (centerMHz === null) continue;
    const pol = pols.reduce((a, b) => (Math.abs(b.y - label.y) < Math.abs(a.y - label.y) ? b : a));
    const chart = chartOf(label.y);
    const near = widths.filter((w) => chartOf(w.y) === chart);
    if (!near.length) continue;
    // A width label marks the start of a run of channels and applies rightward.
    const starts = near.filter((w) => w.x <= label.x + 16);
    const width = starts.length ? starts.reduce((a, b) => (b.x > a.x ? b : a)) : near.reduce((a, b) => (b.x < a.x ? b : a));
    out.push({ centerMHz, bwMHz: +width.str, pol: POLS[pol.str], row: pol.y, x: label.x, chart, polY: pol.y, options: [...new Set(near.map((w) => +w.str))] });
  }
  // The drawn channel box is the authority on width when one can be found.
  const measured = new Set();
  for (const group of Map.groupBy(out, (t) => t.chart).values()) {
    const scale = chartScale(group);
    if (!scale) continue;
    for (const t of group) {
      const boxes = rects.filter((r) => r.x0 <= t.x - 3 && r.x1 >= t.x - 3 && r.y0 <= t.polY + 4 && r.y1 >= t.polY + 4 && r.x1 - r.x0 > 3);
      if (!boxes.length) continue;
      const box = boxes.reduce((a, b) => (b.x1 - b.x0 < a.x1 - a.x0 ? b : a));
      const mhz = (box.x1 - box.x0) * scale;
      const printed = t.options.find((w) => Math.abs(w - mhz) <= Math.max(1.5, w * 0.04));
      t.bwMHz = printed ?? Math.round(mhz);
      measured.add(t);
    }
  }
  // Labels are often printed for one row only, so a width that cannot fit its neighbors is corrected.
  for (const row of Map.groupBy(out, (t) => `${t.row}|${t.pol}`).values()) {
    row.sort((a, b) => a.centerMHz - b.centerMHz);
    row.forEach((t, i) => {
      const gaps = [row[i - 1] && t.centerMHz - row[i - 1].centerMHz, row[i + 1] && row[i + 1].centerMHz - t.centerMHz].filter(Boolean);
      if (!measured.has(t) && gaps.length && t.bwMHz > Math.max(...gaps)) {
        const fit = t.options.filter((w) => w <= Math.max(...gaps));
        if (fit.length) t.bwMHz = Math.max(...fit);
      }
    });
  }
  return out.map(({ centerMHz, bwMHz, pol, row }) => ({ centerMHz, bwMHz, pol, row }));
}

// Rejects a plan that is implausible, and merges beams that reuse the same channel.
export function validateTransponders(list) {
  if (!list.length) return null;
  const rows = Map.groupBy(list, (t) => `${t.row}|${t.pol}`);
  for (const r of rows.values()) {
    const sorted = [...new Map(r.map((t) => [t.centerMHz, t])).values()].sort((a, b) => a.centerMHz - b.centerMHz);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].centerMHz - sorted[i - 1].centerMHz;
      if (gap < (sorted[i].bwMHz + sorted[i - 1].bwMHz) / 2 - 2) return null;
    }
  }
  if (list.some((t) => !bandOf(t.centerMHz))) return null;
  const unique = new Map();
  for (const { centerMHz, bwMHz, pol } of list) unique.set(`${pol}|${centerMHz}`, { centerMHz, bwMHz, pol });
  return [...unique.values()].sort((a, b) => a.centerMHz - b.centerMHz);
}
