import { beamwidthDeg, gainDbi, isModelReliable, offAxisDeg, peakGainDbi } from './antenna.js';
import { BANDS, bandOf, bandsFor, resolveBeacons } from './frequencies.js';
import { createWaterfall, drawExplainer, drawHistory, drawPattern, drawSpectrum } from './display.js';
import { describeController, describeRecord, recordView } from './explain.js';
import { findChip, nextGroup, prevGroup } from './timeline.js';
import { TRANSPONDER_EIRP_DBW, atmosphericLossDb, beaconEirpDbw, computeTrace, dopplerHz, fsplDb, noiseDbm, peakNear, receivedDbm, systemTempK } from './link.js';
import { isGeostationary, look, makeSatrec, nextPass } from './orbit.js';
import { createAutoPeak, createStepTrack } from './track.js';

const $ = (id) => document.getElementById(id);
const BINS = 801;
const SWEEP_S = 1 / 30;
const SLEW_DEG_S = 3;
const TRACK_BW_HZ = 3000;
const XPOL_DB = 30;
const MAX_MISPOINT_DEG = 20; // keeps wide VHF/UHF beams from starting absurdly far off
const TLE_TTL_MS = 2 * 3600e3; // CelesTrak updates about every two hours
const SPANS = [10e3, 50e3, 100e3, 500e3, 1e6, 5e6, 10e6, 50e6, 100e6, 500e6, 1000e6];
const RBWS = [10, 30, 100, 300, 1e3, 3e3, 10e3, 30e3, 100e3, 300e3, 1e6, 3e6];
const CITIES = [
  ['Washington, DC', 38.9072, -77.0369, 20], ['Denver', 39.7392, -104.9903, 1609], ['Los Angeles', 34.0522, -118.2437, 90],
  ['London', 51.5074, -0.1278, 11], ['Madrid', 40.4168, -3.7038, 667], ['Dubai', 25.2048, 55.2708, 5], ['Nairobi', -1.2921, 36.8219, 1795],
  ['Singapore', 1.3521, 103.8198, 15], ['Tokyo', 35.6762, 139.6503, 40], ['Sydney', -33.8688, 151.2093, 58], ['São Paulo', -23.5505, -46.6333, 760],
];

const S = {
  sats: [], data: { plans: {}, transmitters: {}, transponders: {} }, omm: null, satrec: null, isGeo: false,
  station: { lat: CITIES[0][1], lon: CITIES[0][2], altM: CITIES[0][3] }, band: 'Ku', beacons: [], beacon: null, diameterM: 2.4,
  az: 0, el: 0, target: { az: 0, el: 0 }, frame: { az: 0, el: 0 }, lastLook: null, timeOffsetMs: 0,
  centerHz: 11.7e9, spanHz: 1e6, rbwHz: 3e3, avgN: 4, avgTrace: null, holdTrace: null, topDbm: -40, bottomDbm: -130,
  jogMode: 'hold', jogSpeed: 0.2, held: new Map(), trackIntervalS: 20, trackDwellS: 1.5, scanPattern: 'spiral',
  history: [], historyWindowS: 30, hoverX: null, explainInfo: null, sweepCount: 0, stepsKey: null,
  paused: false, pausedSimMs: 0, run: null, reviewIndex: 0, dirty: false,
  ctl: null, ctlKind: null, reveal: false, beamwidth: 1, trackEma: null, passDate: null, satToken: 0,
};
let waterfall;

const wrap360 = (a) => ((a % 360) + 360) % 360;
const wrap180 = (a) => ((a + 540) % 360) - 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const simDate = () => new Date(S.paused ? S.pausedSimMs : Date.now() + S.timeOffsetMs);
const safeUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol) ? u : null; } catch { return null; } };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function option(parent, value, text, selected = false) {
  const o = document.createElement('option');
  o.value = value; o.textContent = text; o.selected = selected;
  parent.append(o);
}
const hzLabel = (h) => (h >= 1e6 ? `${h / 1e6} MHz` : h >= 1e3 ? `${h / 1e3} kHz` : `${h} Hz`);

async function loadJson(name) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

function validOmm(o, norad) {
  return o?.NORAD_CAT_ID === norad && ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY'].every((k) => Number.isFinite(o[k])) && !Number.isNaN(Date.parse(o.EPOCH));
}

// One satellite at a time, cached, so normal use stays well inside CelesTrak's limits.
async function freshElements(norad) {
  const key = `gp:${norad}`;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TLE_TTL_MS && validOmm(hit.omm, norad)) return hit.omm;
  try {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=json`);
    if (!res.ok) return null;
    const [omm] = await res.json();
    if (!validOmm(omm, norad)) return null;
    store.set(key, { at: Date.now(), omm });
    return omm;
  } catch { return null; }
}

function applyOmm(omm) {
  S.omm = omm;
  S.satrec = makeSatrec(omm);
  S.isGeo = isGeostationary(omm);
  $('rNorad').textContent = omm.NORAD_CAT_ID;
  $('rOrbit').textContent = S.isGeo ? 'Geostationary' : omm.MEAN_MOTION > 11 ? 'LEO' : omm.MEAN_MOTION > 1.5 ? 'MEO / HEO' : 'High orbit';
  $('rEpoch').textContent = omm.EPOCH.slice(0, 16).replace('T', ' ') + 'Z';
}

async function selectSatellite(omm) {
  const token = ++S.satToken;
  stopControl();
  S.timeOffsetMs = 0;
  applyOmm(omm);
  $('satSearch').value = omm.OBJECT_NAME;
  $('program').checked = !S.isGeo;
  populateBands();
  mispoint();
  const fresh = await freshElements(omm.NORAD_CAT_ID);
  if (fresh && token === S.satToken) { applyOmm(fresh); S.lastLook = null; checkVisibility(); }
}

function populateBands() {
  const { known, other } = bandsFor(S.omm.NORAD_CAT_ID, S.data);
  const planBands = (S.data.transponders[S.omm.NORAD_CAT_ID] ?? []).map((t) => bandOf(t.centerMHz));
  const sel = $('band');
  const keep = known.includes(S.band) ? S.band : known[0] ?? (BANDS[S.band] ? S.band : 'Ku');
  sel.replaceChildren();
  const group = (label, list) => {
    if (!list.length) return;
    const g = document.createElement('optgroup');
    g.label = label;
    list.forEach((b) => option(g, b, b, b === keep));
    sel.append(g);
  };
  group('Published data', known);
  group('Estimated beacon', other.filter((b) => !planBands.includes(b) || !known.includes(b)));
  S.band = keep;
  populateBeacons();
}

function populateBeacons() {
  S.beacons = resolveBeacons(S.omm.NORAD_CAT_ID, S.band, S.data);
  const sel = $('beacon');
  sel.replaceChildren();
  S.beacons.forEach((b, i) => option(sel, i, `${b.freqMHz.toFixed(3)} MHz${b.pol ? ` ${b.pol}` : ''}${b.beam ? ` (${b.beam})` : ''}`));
  selectBeacon(0);
}

function selectBeacon(i) {
  S.beacon = S.beacons[i];
  const box = $('beaconSource');
  box.replaceChildren(`Source: ${S.beacon.source}`);
  const url = safeUrl(S.beacon.url);
  if (url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = 'view source';
    box.append(' · ', a);
  }
  if (S.beacon.source === 'Estimated') box.append('. No published beacon found for this band, so this frequency is made up.');
  S.centerHz = S.beacon.freqMHz * 1e6;
  S.spanHz = S.isGeo ? 1e6 : 100e3;
  syncAnalyzer();
  updateSignalSetup();
}

function autoRbw() {
  const want = S.spanHz / 300;
  return RBWS.reduce((a, b) => (Math.abs(Math.log(b / want)) < Math.abs(Math.log(a / want)) ? b : a));
}

function syncAnalyzer() {
  S.rbwHz = autoRbw();
  $('center').value = (S.centerHz / 1e6).toFixed(3);
  $('span').value = S.spanHz;
  $('rbw').value = S.rbwHz;
  resetTraces();
}

function resetTraces() { S.avgTrace = null; S.holdTrace = null; }

function freqHz() { return S.beacon.freqMHz * 1e6; }

function updateSignalSetup() {
  S.beamwidth = beamwidthDeg(S.diameterM, freqHz());
  $('rGain').textContent = `${peakGainDbi(S.diameterM, freqHz()).toFixed(1)} dBi`;
  $('rBw').textContent = `${S.beamwidth.toFixed(3)}°`;
  const warn = $('modelWarn');
  warn.hidden = isModelReliable(S.diameterM, freqHz());
  warn.textContent = 'This dish is under 10 wavelengths across at this frequency, so the side-lobe model is unreliable.';
  stopControl();
  checkVisibility();
  rescale();
}

function rescale() {
  const l = look(S.satrec, S.station, simDate());
  if (!l) return;
  const noise = noiseDbm(systemTempK(S.beacon.freqMHz), S.rbwHz);
  const peak = expectedDbm(l);
  S.bottomDbm = Math.floor((noise - 10) / 10) * 10;
  S.topDbm = Math.max(S.bottomDbm + 50, Math.ceil((Math.max(peak, noise) + 10) / 10) * 10);
}

const expectedDbm = (l) => receivedDbm({ eirpDbw: beaconEirpDbw(S.isGeo), rangeKm: l.rangeKm, freqMHz: S.beacon.freqMHz, elDeg: Math.max(l.el, 1), gainDbi: peakGainDbi(S.diameterM, freqHz()) });

function checkVisibility() {
  const l = look(S.satrec, S.station, simDate());
  const banner = $('banner'), jump = $('jumpPass');
  S.passDate = null;
  if (!l) { banner.style.display = 'block'; $('bannerText').textContent = 'These orbital elements could not be propagated.'; jump.hidden = true; return; }
  if (l.el > 0) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  S.passDate = nextPass(S.satrec, S.station, simDate());
  jump.hidden = !S.passDate;
  $('bannerText').textContent = S.passDate
    ? `Below the horizon (${l.el.toFixed(1)}°). Next pass ${S.passDate.toISOString().slice(0, 16).replace('T', ' ')}Z.`
    : `Below the horizon (${l.el.toFixed(1)}°) with no pass in the next 72 hours from this location.`;
}

function setPaused(paused) {
  if (paused === S.paused) return;
  if (paused) {
    S.pausedSimMs = simDate().getTime();
    S.paused = true;
    if (S.held.size) { S.held.clear(); S.target = { az: S.az, el: S.el }; }
    S.reviewIndex = Math.max(0, (S.run?.records.length ?? 1) - 1);
  } else {
    // Simulated time picks up where it stopped instead of jumping ahead.
    S.timeOffsetMs = S.pausedSimMs - Date.now();
    S.paused = false;
  }
  S.dirty = true;
}

function review(index) {
  const n = S.run?.records.length ?? 0;
  if (!n || index < 0) return;
  setPaused(true);
  S.reviewIndex = clamp(index, 0, n - 1);
  S.dirty = true;
}

function mispoint() {
  S.held.clear();
  S.paused = false;
  S.run = null;
  S.dirty = true;
  stopControl();
  S.explainInfo = null;
  S.history = [];
  const l = look(S.satrec, S.station, simDate());
  S.lastLook = null;
  S.frame = { az: 0, el: 0 };
  checkVisibility();
  S.beamwidth = beamwidthDeg(S.diameterM, freqHz());
  if (!l) return;
  const angle = Math.random() * 2 * Math.PI;
  const r = Math.min(MAX_MISPOINT_DEG, S.beamwidth * (1.5 + Math.random() * 2.5));
  S.target = { az: wrap360(l.az + (r * Math.cos(angle)) / Math.max(0.1, Math.cos((l.el * Math.PI) / 180))), el: clamp(l.el + r * Math.sin(angle), 0, 90) };
  S.az = S.target.az; S.el = S.target.el;
  S.reveal = false;
  $('reveal').textContent = 'Reveal offset';
  $('rOff').textContent = 'hidden';
  resetTraces();
  rescale();
}

// Skips identical writes so the live region is not re-announced every sweep.
function setStatus(text, cls = '') {
  const el = $('status');
  if (el.textContent !== text) el.textContent = text;
  if (el.className !== cls) el.className = cls;
}

function stopControl(message) {
  S.ctl = null; S.ctlKind = null;
  $('nextCycle').textContent = '';
  // A finished result stays up to study; an interrupted run goes back to the manual explanation.
  if (!['done', 'notfound'].includes(S.explainInfo?.phase)) S.explainInfo = null;
  $('autoPeak').classList.remove('active');
  $('stepTrack').classList.remove('active');
  if (message !== undefined) setStatus(message);
  else setStatus('');
}

const dwellSweeps = () => Math.max(1, Math.round(S.trackDwellS / SWEEP_S));

function showCycleNote() {
  const cycle = S.trackDwellS * 6; // three points on each of two axes
  $('cycleNote').textContent = cycle >= S.trackIntervalS
    ? `One cycle takes about ${cycle.toFixed(1)} s, so cycles run back to back.`
    : `One cycle takes about ${cycle.toFixed(1)} s, then it holds until the next.`;
}

function startControl(kind) {
  setPaused(false);
  if (S.ctlKind === kind) { stopControl('Stopped.'); return; }
  stopControl();
  const noise = noiseDbm(systemTempK(S.beacon.freqMHz), TRACK_BW_HZ);
  S.frame = { az: 0, el: 0 };
  const base = { az: S.az, el: S.el, beamwidthDeg: S.beamwidth, noiseDbm: noise };
  S.ctl = kind === 'peak' ? createAutoPeak({ ...base, radiusDeg: Math.min(MAX_MISPOINT_DEG * 1.25, S.beamwidth * 5), dwell: 1, pattern: S.scanPattern }) : createStepTrack({ ...base, dwell: dwellSweeps(), intervalS: S.trackIntervalS });
  S.ctlKind = kind;
  S.run = S.ctl.run;
  $(kind === 'peak' ? 'autoPeak' : 'stepTrack').classList.add('active');
}

function jog(dAz, dEl) {
  if (S.paused) return;
  if (S.ctl) stopControl('Manual control.');
  const step = +$('step').value;
  S.target = { az: wrap360(S.target.az + (dAz * step) / Math.max(0.05, Math.cos((S.target.el * Math.PI) / 180))), el: clamp(S.target.el + dEl * step, 0, 90) };
}

function holdStart(id, dir) {
  if (S.paused) return;
  if (S.ctl) stopControl('Manual control.');
  S.held.set(id, dir);
}

function holdEnd(id) {
  if (S.held.delete(id) && !S.held.size) S.target = { az: S.az, el: S.el }; // stop where it is, with no coast
}

function setJogMode(mode) {
  S.held.clear();
  S.target = { az: S.az, el: S.el };
  S.jogMode = mode;
  $('modeHold').classList.toggle('active', mode === 'hold');
  $('modeStep').classList.toggle('active', mode === 'step');
  $('modeHold').setAttribute('aria-pressed', mode === 'hold');
  $('modeStep').setAttribute('aria-pressed', mode === 'step');
  $('speedWrap').hidden = mode !== 'hold';
  $('stepWrap').hidden = mode !== 'step';
}

function applyHeldJog(slewDegS, dt) {
  let x = 0, y = 0;
  for (const [a, b] of S.held.values()) { x += a; y += b; }
  x = Math.sign(x); y = Math.sign(y);
  const speed = Math.min(S.jogSpeed, slewDegS);
  // Speed is true angle on the sky, so azimuth turns faster at high elevation, up to the slew limit.
  const azRate = Math.min(speed / Math.max(0.05, Math.cos((S.el * Math.PI) / 180)), slewDegS);
  S.target = { az: wrap360(S.target.az + x * azRate * dt), el: clamp(S.target.el + y * speed * dt, 0, 90) };
}

function blocksFor(l, gain) {
  const list = (S.data.transponders[S.omm.NORAD_CAT_ID] ?? []).filter((t) => bandOf(t.centerMHz) === S.band);
  if (!list.length) return [];
  const pols = new Set(list.map((t) => t.pol));
  const pol = (S.beacon.pol || '').split('/').find((p) => pols.has(p)) ?? list[0].pol;
  return list.filter((t) => t.pol === pol).map((t) => {
    // Occupancy is not published, so each transponder gets a stable modeled level.
    const trim = -((t.centerMHz * 7.13) % 7);
    const psd = TRANSPONDER_EIRP_DBW + 30 + trim - 10 * Math.log10(t.bwMHz * 1e6) - fsplDb(l.rangeKm, t.centerMHz) - atmosphericLossDb(t.centerMHz, l.el) + gain;
    return { lowHz: (t.centerMHz - t.bwMHz / 2) * 1e6, highHz: (t.centerMHz + t.bwMHz / 2) * 1e6, dbmPerHz: psd };
  });
}

function sweep(dt) {
  const date = simDate();
  const l = look(S.satrec, S.station, date);
  if (!l) return;

  if ($('program').checked && S.lastLook) {
    const dAz = wrap180(l.az - S.lastLook.az), dEl = l.el - S.lastLook.el;
    S.frame.az += dAz; S.frame.el += dEl;
    if (!S.ctl) S.target = { az: wrap360(S.target.az + dAz), el: clamp(S.target.el + dEl, 0, 90) };
  }
  S.lastLook = l;

  // Small wide-beam antennas slew faster, which keeps their much larger search area practical.
  const slewDegS = clamp(S.beamwidth * 3, SLEW_DEG_S, 12);
  S.ctl?.advance?.(dt);
  if (S.ctl) {
    const t = S.ctl.target();
    S.target = { az: wrap360(t.az + S.frame.az), el: clamp(t.el + S.frame.el, 0, 90) };
  } else if (S.held.size) applyHeldJog(slewDegS, dt);
  const maxMove = slewDegS * dt;
  const dAz = wrap180(S.target.az - S.az), dEl = S.target.el - S.el;
  S.az = wrap360(S.az + clamp(dAz, -maxMove, maxMove));
  S.el += clamp(dEl, -maxMove, maxMove);
  const arrived = Math.abs(dAz) <= maxMove && Math.abs(dEl) <= maxMove;

  const off = offAxisDeg(S.az, S.el, l.az, l.el);
  const f = freqHz();
  const gain = gainDbi(off, S.diameterM, f);
  const visible = l.el > 0;
  const shift = (hz) => hz + dopplerHz(hz, l.rangeRateKmS);
  const carrierDbm = visible ? receivedDbm({ eirpDbw: beaconEirpDbw(S.isGeo), rangeKm: l.rangeKm, freqMHz: S.beacon.freqMHz, elDeg: l.el, gainDbi: gain }) : -Infinity;
  const tempK = systemTempK(S.beacon.freqMHz);
  const carriers = !visible ? [] : S.beacons.map((b) => ({
    freqHz: shift(b.freqMHz * 1e6),
    dbm: carrierDbm - (b === S.beacon || !b.pol || !S.beacon.pol || b.pol.split('/').some((p) => S.beacon.pol.includes(p)) ? 0 : XPOL_DB),
  }));
  const blocks = visible && S.isGeo ? blocksFor(l, gain) : [];
  const raw = computeTrace({ centerHz: S.centerHz, spanHz: S.spanHz, rbwHz: S.rbwHz, bins: BINS, noiseFloorDbm: noiseDbm(tempK, S.rbwHz), carriers, blocks });

  if (!S.avgTrace) S.avgTrace = Float32Array.from(raw, (v) => 10 ** (v / 10));
  const k = 1 / S.avgN;
  const shown = new Float32Array(BINS);
  for (let i = 0; i < BINS; i++) {
    S.avgTrace[i] += (10 ** (raw[i] / 10) - S.avgTrace[i]) * k;
    shown[i] = 10 * Math.log10(S.avgTrace[i]);
  }
  if ($('hold').checked) {
    S.holdTrace ??= shown.slice();
    for (let i = 0; i < BINS; i++) S.holdTrace[i] = Math.max(S.holdTrace[i], shown[i]);
  } else S.holdTrace = null;

  // The tracking receiver is a separate narrow filter, so the analyzer view cannot disturb control.
  const trackNoise = 10 ** (noiseDbm(tempK, TRACK_BW_HZ) / 10);
  const trackDbm = 10 * Math.log10((visible ? 10 ** (carrierDbm / 10) : 0) + trackNoise * -Math.log(1 - Math.random()));
  const ema = 10 ** (trackDbm / 10);
  S.trackEma = S.trackEma === null ? ema : S.trackEma + (ema - S.trackEma) * 0.25;

  if (S.ctl && arrived) {
    S.ctl.update(trackDbm);
    const { records } = S.ctl.run;
    for (let i = records.length - 1; i >= 0 && !records[i].t; i--) {
      records[i].t = date.getTime();
      records[i].frame = { ...S.frame };
    }
  }
  if (S.ctl) S.explainInfo = S.ctl.explain;
  if (++S.sweepCount % 3 === 0) recordHistory(date.getTime(), l, 10 * Math.log10(S.trackEma));
  updateControlStatus(l);

  const expected = expectedDbm(l);
  const window = Math.max(S.rbwHz * 2, S.spanHz / 200);
  S.frameData = { shown, marker: peakNear(shown, S.centerHz, S.spanHz, shift(f), window), l, off, expected, shift: shift(f) - f, trackNoiseDb: 10 * Math.log10(trackNoise) };
  waterfall.push(shown, S.bottomDbm, S.topDbm - 10);
}

function recordHistory(t, l, db) {
  const info = S.ctl ? S.explainInfo : null;
  const phase = !info ? null : info.phase === 'search' ? 'search' : info.phase === 'hold' ? 'hold' : 'measure';
  S.history.push({ t, az: S.az, el: S.el, db, satAz: l.az, satEl: l.el, phase });
  while (S.history.length && S.history[0].t < t - 600e3) S.history.shift();
}

function renderExplainer() {
  const records = S.run?.records ?? [];
  const rec = S.paused ? records[S.reviewIndex] : null;
  const d = rec ? describeRecord(S.run, rec) : describeController(S.explainInfo);
  const key = d.steps.join('|');
  const list = $('ctlSteps');
  if (S.stepsKey !== key) {
    S.stepsKey = key;
    list.replaceChildren(...d.steps.map((s, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.textContent = s;
      b.dataset.chip = i;
      li.append(b);
      return li;
    }));
  }
  [...list.querySelectorAll('button')].forEach((b, i) => {
    const cls = i === d.active ? 'now' : i < d.active ? 'past' : '';
    if (b.className !== cls) b.className = cls;
    if (i === d.active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  if ($('ctlTitle').textContent !== d.title) $('ctlTitle').textContent = d.title;
  if ($('ctlText').textContent !== d.text) $('ctlText').textContent = d.text;
  drawExplainer($('explainPlot'), rec ? recordView(S.run, rec) : S.explainInfo);

  const pauseLabel = S.paused ? 'Resume' : 'Pause';
  if ($('pause').textContent !== pauseLabel) $('pause').textContent = pauseLabel;
  $('pause').classList.toggle('active', S.paused);
  const reviewing = S.paused && records.length > 0;
  for (const id of ['prevGroup', 'prevStep', 'nextStep', 'nextGroup', 'reviewSlider']) $(id).disabled = !reviewing;
  const slider = $('reviewSlider');
  slider.max = Math.max(0, records.length - 1);
  slider.value = reviewing ? S.reviewIndex : slider.max;
  const pos = reviewing ? `${S.reviewIndex + 1} / ${records.length}` : records.length ? `${records.length} saved` : '';
  if ($('reviewPos').textContent !== pos) $('reviewPos').textContent = pos;
}

function updateControlStatus(l) {
  if (!S.ctl) return;
  if (S.ctlKind === 'peak') {
    if (S.ctl.phase === 'search') setStatus(`Searching ${(S.ctl.progress * 100).toFixed(0)}%`);
    else if (S.ctl.phase === 'refine') setStatus('Refining on the main lobe…');
    else if (S.ctl.phase === 'done') {
      const t = S.ctl.target();
      S.target = { az: wrap360(t.az + S.frame.az), el: clamp(t.el + S.frame.el, 0, 90) };
      stopControl('Peaked.'); $('status').className = 'ok';
    } else if (S.ctl.phase === 'notfound') {
      const t = S.ctl.target();
      S.target = { az: wrap360(t.az + S.frame.az), el: clamp(t.el + S.frame.el, 0, 90) };
      stopControl('No beacon found in the search area.'); $('status').className = 'bad';
    }
  } else if (S.ctl.phase === 'lost') setStatus(l.el > 0 ? 'Track lost. Signal is near the noise floor. Try auto-peak.' : 'Track lost. Satellite is below the horizon.', 'bad');
  else if (S.ctl.level !== null && S.ctl.level < expectedDbm(l) - 8) setStatus('Tracking, but well below the expected level. This may be a side lobe. Try auto-peak.', 'warn');
  else setStatus('Tracking.', 'ok');
  if (S.ctlKind === 'track') {
    const next = S.ctl.waiting ? `Next az/el cycle in ${Math.ceil(S.ctl.nextInS)} s` : 'Running az/el cycle…';
    if ($('nextCycle').textContent !== next) $('nextCycle').textContent = next;
  }
}

function render() {
  const d = S.frameData;
  if (!d) return;
  drawSpectrum($('spectrum'), { trace: d.shown, hold: S.holdTrace, centerHz: S.centerHz, spanHz: S.spanHz, topDbm: S.topDbm, bottomDbm: S.bottomDbm, marker: d.marker });
  waterfall.draw(S.centerHz, S.spanHz);
  drawPattern($('patternPlot'), { diameterM: S.diameterM, freqHz: freqHz(), beamwidth: S.beamwidth, offAxis: S.reveal ? d.off : null });
  renderExplainer();
  const histNote = S.reveal ? "Dashed line: the satellite's true position." : "Reveal the offset to overlay the satellite's true position as a dashed line.";
  if ($('histNote').textContent !== histNote) $('histNote').textContent = histNote;
  const nowMs = simDate().getTime();
  const cursorT = S.paused ? S.run?.records[S.reviewIndex]?.t ?? null : null;
  // Widen the view while reviewing so the selected reading stays on the plot.
  const windowS = cursorT === null ? S.historyWindowS : Math.max(S.historyWindowS, Math.min(600, Math.ceil(((nowMs - cursorT) / 1000) * 1.1)));
  drawHistory($('history'), { samples: S.history, windowS, nowMs, showSat: S.reveal, hoverX: S.hoverX, cursorT });
  const level = 10 * Math.log10(S.trackEma);
  $('level').textContent = $('dockLevel').textContent = `${level.toFixed(1)} dBm`;
  $('rCn').textContent = `${(level - d.trackNoiseDb).toFixed(1)} dB`;
  $('rExpected').textContent = d.l.el > 0 ? `${d.expected.toFixed(1)} dBm` : 'below horizon';
  $('rAz').textContent = $('dockAz').textContent = `${S.az.toFixed(3)}°`;
  $('rEl').textContent = $('dockEl').textContent = `${S.el.toFixed(3)}°`;
  if (S.reveal) $('rOff').textContent = `${d.off.toFixed(3)}° (sat ${d.l.az.toFixed(2)}, ${d.l.el.toFixed(2)})`;
  $('rRange').textContent = `${Math.round(d.l.rangeKm).toLocaleString()} km`;
  $('rDoppler').textContent = `${(d.shift / 1000).toFixed(2)} kHz`;
}

let last = 0, debt = 0;
function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000 || 0);
  last = now;
  debt += dt;
  let n = 0;
  if (S.paused) debt = 0;
  while (debt >= SWEEP_S && n++ < 4) { sweep(SWEEP_S); debt -= SWEEP_S; }
  if (n >= 4) debt = 0;
  if (n || S.dirty) { S.dirty = false; render(); }
  requestAnimationFrame(loop);
}

function setupPicker() {
  const input = $('satSearch'), list = $('satList');
  let matches = [], active = -1;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const mark = () => {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', i === active));
    if (active >= 0) { input.setAttribute('aria-activedescendant', `sat-${active}`); list.children[active].scrollIntoView({ block: 'nearest' }); }
  };
  const choose = (o) => { close(); selectSatellite(o); };
  const show = () => {
    const q = input.value.trim().toUpperCase();
    const score = (o) => (String(o.NORAD_CAT_ID) === q || o.OBJECT_NAME === q ? 0 : o.OBJECT_NAME.startsWith(q) ? 1 : 2);
    matches = (q ? S.sats.filter((o) => o.OBJECT_NAME.toUpperCase().includes(q) || String(o.NORAD_CAT_ID).startsWith(q)) : S.sats)
      .slice().sort((a, b) => score(a) - score(b) || a.OBJECT_NAME.localeCompare(b.OBJECT_NAME)).slice(0, 60);
    list.replaceChildren(...matches.map((o, i) => {
      const li = document.createElement('li');
      li.id = `sat-${i}`; li.setAttribute('role', 'option');
      const small = document.createElement('small');
      small.textContent = ` ${o.NORAD_CAT_ID}${S.data.plans[o.NORAD_CAT_ID] ? ' · beacon data' : ''}`;
      li.append(o.OBJECT_NAME, small);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(o); });
      return li;
    }));
    active = -1;
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(!list.hidden));
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', () => { input.select(); show(); });
  input.addEventListener('blur', () => { close(); if (S.omm) input.value = S.omm.OBJECT_NAME; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) show();
      if (matches.length) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; mark(); }
    } else if (e.key === 'Enter' && matches.length) { choose(matches[Math.max(active, 0)]); input.blur(); }
    else if (e.key === 'Escape') { close(); input.blur(); }
  });
}

function setStation() {
  const lat = +$('lat').value, lon = +$('lon').value, altM = +$('alt').value;
  if (![lat, lon, altM].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || altM < -400 || altM > 9000) {
    setStatus('Enter a latitude within ±90, longitude within ±180 and altitude from -400 to 9000 m.', 'bad');
    return;
  }
  S.station = { lat, lon, altM };
  if (S.omm) mispoint();
}

function showStation() {
  $('lat').value = S.station.lat; $('lon').value = S.station.lon; $('alt').value = S.station.altM;
}

function wire() {
  CITIES.forEach((c, i) => option($('city'), i, c[0]));
  option($('city'), 'custom', 'Custom');
  SPANS.forEach((s) => option($('span'), s, hzLabel(s)));
  RBWS.forEach((r) => option($('rbw'), r, hzLabel(r)));
  showStation();

  $('city').addEventListener('change', (e) => {
    if (e.target.value === 'custom') return;
    const c = CITIES[+e.target.value];
    S.station = { lat: c[1], lon: c[2], altM: c[3] };
    showStation();
    if (S.omm) mispoint();
  });
  for (const id of ['lat', 'lon', 'alt']) $(id).addEventListener('change', () => { $('city').value = 'custom'; setStation(); });
  $('geo').addEventListener('click', () => {
    if (!navigator.geolocation) { setStatus('Location is not available in this browser.', 'bad'); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      S.station = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), altM: Math.round(p.coords.altitude ?? 0) };
      $('city').value = 'custom';
      showStation();
      mispoint();
    }, (err) => setStatus(`Could not get location: ${err.message}`, 'bad'));
  });
  $('dish').addEventListener('change', (e) => {
    const v = +e.target.value;
    if (!Number.isFinite(v) || v < 0.3 || v > 35) { e.target.value = S.diameterM; setStatus('Dish diameter must be 0.3 to 35 m.', 'bad'); return; }
    S.diameterM = v;
    updateSignalSetup();
  });
  $('band').addEventListener('change', (e) => { S.band = e.target.value; populateBeacons(); });
  $('beacon').addEventListener('change', (e) => selectBeacon(+e.target.value));
  $('center').addEventListener('change', (e) => {
    const v = +e.target.value;
    if (!Number.isFinite(v) || v <= 0) { e.target.value = (S.centerHz / 1e6).toFixed(3); return; }
    S.centerHz = v * 1e6;
    resetTraces();
  });
  $('span').addEventListener('change', (e) => { S.spanHz = +e.target.value; syncAnalyzer(); rescale(); });
  $('rbw').addEventListener('change', (e) => { S.rbwHz = +e.target.value; resetTraces(); rescale(); });
  $('avg').addEventListener('change', (e) => { S.avgN = +e.target.value; S.avgTrace = null; });
  $('clearHold').addEventListener('click', () => { S.holdTrace = null; });
  $('recenter').addEventListener('click', () => { S.centerHz = freqHz() + (S.frameData?.shift ?? 0); $('center').value = (S.centerHz / 1e6).toFixed(3); resetTraces(); });
  for (const [id, dir] of Object.entries({ up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] })) {
    const b = $(id);
    b.style.touchAction = 'none';
    b.addEventListener('contextmenu', (e) => e.preventDefault()); // A long press would otherwise end the hold.
    b.addEventListener('pointerdown', (e) => {
      if (S.jogMode !== 'hold' || e.button !== 0) return;
      b.setPointerCapture(e.pointerId);
      b.classList.add('held');
      holdStart(id, dir);
    });
    // Stops the phone's long-press gesture. Step mode still needs the tap's click.
    b.addEventListener('touchstart', (e) => { if (S.jogMode === 'hold') e.preventDefault(); }, { passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => { b.classList.remove('held'); holdEnd(id); });
    // detail 0 is a keyboard-activated click, which has no press duration to hold.
    b.addEventListener('click', (e) => { if (S.jogMode === 'step' || e.detail === 0) jog(...dir); });
  }
  $('histWindow').addEventListener('change', (e) => { S.historyWindowS = +e.target.value; });
  for (const type of ['pointerdown', 'pointermove']) $('history').addEventListener(type, (e) => { S.hoverX = e.clientX - e.currentTarget.getBoundingClientRect().left; S.dirty = true; });
  $('history').addEventListener('pointerleave', () => { S.hoverX = null; S.dirty = true; });
  $('pause').addEventListener('click', () => setPaused(!S.paused));
  $('prevStep').addEventListener('click', () => review(S.reviewIndex - 1));
  $('nextStep').addEventListener('click', () => review(S.reviewIndex + 1));
  $('prevGroup').addEventListener('click', () => review(prevGroup(S.run.records, S.reviewIndex)));
  $('nextGroup').addEventListener('click', () => review(nextGroup(S.run.records, S.reviewIndex)));
  $('reviewSlider').addEventListener('input', (e) => review(+e.target.value));
  $('ctlSteps').addEventListener('click', (e) => {
    const chip = e.target.closest('button')?.dataset.chip;
    if (chip === undefined || !S.run?.records.length) return;
    const from = S.paused ? S.reviewIndex : S.run.records.length - 1;
    review(findChip(S.run, from, +chip));
  });
  $('modeHold').addEventListener('click', () => setJogMode('hold'));
  $('modeStep').addEventListener('click', () => setJogMode('step'));
  $('jogSpeed').addEventListener('change', (e) => {
    const v = +e.target.value;
    if (!Number.isFinite(v) || v < 0.001 || v > 12) { e.target.value = S.jogSpeed; setStatus('Jog speed must be 0.001 to 12 °/s.', 'bad'); return; }
    S.jogSpeed = v;
  });
  $('trackInterval').addEventListener('change', (e) => {
    const v = +e.target.value;
    if (!Number.isFinite(v) || v < 1 || v > 3600) { e.target.value = S.trackIntervalS; setStatus('Step-track interval must be 1 to 3600 s.', 'bad'); return; }
    S.trackIntervalS = v;
    if (S.ctlKind === 'track') S.ctl.setIntervalS(v);
    showCycleNote();
  });
  $('trackDwell').addEventListener('change', (e) => {
    const v = +e.target.value;
    if (!Number.isFinite(v) || v < 0.1 || v > 30) { e.target.value = S.trackDwellS; setStatus('Time per point must be 0.1 to 30 s.', 'bad'); return; }
    S.trackDwellS = v;
    if (S.ctlKind === 'track') S.ctl.setDwell(dwellSweeps());
    showCycleNote();
  });
  $('scanPattern').addEventListener('change', (e) => { S.scanPattern = e.target.value === 'raster' ? 'raster' : 'spiral'; });
  showCycleNote();
  $('reveal').addEventListener('click', () => {
    S.reveal = !S.reveal;
    $('reveal').textContent = S.reveal ? 'Hide offset' : 'Reveal offset';
    if (!S.reveal) $('rOff').textContent = 'hidden';
  });
  $('mispoint').addEventListener('click', mispoint);
  $('goPredicted').addEventListener('click', () => {
    if (S.ctl) stopControl('Manual control.');
    const l = look(S.satrec, S.station, simDate());
    if (l) S.target = { az: l.az, el: clamp(l.el, 0, 90) };
  });
  $('autoPeak').addEventListener('click', () => startControl('peak'));
  $('stepTrack').addEventListener('click', () => startControl('track'));
  $('jumpPass').addEventListener('click', () => {
    if (!S.passDate) return;
    // Land just after rise so the satellite is usable immediately.
    S.timeOffsetMs = S.passDate.getTime() + 20000 - Date.now();
    mispoint();
  });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    const m = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!m) return;
    e.preventDefault();
    if (S.paused) {
      if (m[0]) review(S.reviewIndex + m[0]); // left and right step through readings while paused
      return;
    }
    if (S.jogMode === 'step') jog(...m);
    else if (!e.repeat) holdStart(e.key, m);
  });
  window.addEventListener('keyup', (e) => holdEnd(e.key));
  // A key or pointer released while the window is unfocused would otherwise jog forever.
  window.addEventListener('blur', () => { if (S.held.size) { S.held.clear(); S.target = { az: S.az, el: S.el }; } });
}

// Open on a satellite with real plan data that this station can actually see.
function defaultSatellite() {
  const now = new Date();
  let best = null, bestEl = 5;
  for (const o of S.sats) {
    if (!S.data.transponders[o.NORAD_CAT_ID] || !S.data.plans[o.NORAD_CAT_ID]) continue;
    const l = look(makeSatrec(o), S.station, now);
    if (l && l.el > bestEl) { best = o; bestEl = l.el; }
  }
  return best ?? S.sats.find((o) => isGeostationary(o)) ?? S.sats[0];
}

async function start() {
  wire();
  try {
    const [sats, plans, transmitters, transponders] = await Promise.all(['sats.json', 'beacons.json', 'transmitters.json', 'transponders.json'].map(loadJson));
    S.sats = sats.rows.map((r) => Object.fromEntries(sats.fields.map((k, i) => [k, r[i]])));
    S.data = { plans, transmitters, transponders };
  } catch (err) {
    $('banner').style.display = 'block';
    $('bannerText').textContent = `Could not load satellite data (${err.message}). Run "npm run data" and reload.`;
    $('satSearch').placeholder = 'Catalog unavailable';
    return;
  }
  $('satSearch').disabled = false;
  $('satSearch').placeholder = 'Search satellites';
  setupPicker();
  waterfall = createWaterfall($('waterfall'), BINS);
  await selectSatellite(defaultSatellite());
  requestAnimationFrame(loop);
}

start();
