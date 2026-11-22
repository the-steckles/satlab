// Link model for a fictional bent-pipe satellite. Interference is set relative to the carrier,
// so this teaches effects and diagnosis without any transmit-power or targeting inputs.
import { constellation, gaussian, merDb } from '../../lib/constellation.js';

export const RS_MHZ = 5, TP_HALF_MHZ = 18;
export const UP_CENTER_MHZ = 14250, DOWN_CENTER_MHZ = 12500;
const UPLINK_CN_DB = 22, DOWNLINK_CN_AT_SAT_DB = 25, SYSTEM_TEMP_K = 150, RAIN_TEMP_K = 275;

// DVB-S2 quasi-error-free Es/N0 thresholds, ETSI EN 302 307-1.
export const MODCODS = {
  'QPSK 1/2': 1.0, 'QPSK 3/4': 4.03, '8PSK 2/3': 6.62, '8PSK 3/4': 7.91, '16APSK 3/4': 10.21, '32APSK 3/4': 12.73,
};

export const DEFAULTS = {
  carrierMHz: -8, rsMHz: RS_MHZ, neighborOn: true, neighborMHz: 8, neighborRsMHz: RS_MHZ, neighborTrimDb: 0,
  modcod: '16APSK 3/4', iboDb: 6, trimDb: 0, alc: false, rainDb: 0, mispointDb: 0,
  interferer: { on: false, kind: 'cw', path: 'uplink', icDb: -10, offsetMHz: -8, narrowMHz: 0.5, bwMHz: 12, wideMHz: 36, spanMHz: 30, sweepWidthMHz: 0, sweepS: 8, sweepShape: 'triangle' },
};

const lin = (db) => 10 ** (db / 10);
const dB = (x) => 10 * Math.log10(x);

// Saleh TWTA curve in power, normalized so 0 dB input backoff is exactly saturation. Held flat past it.
export const twtaOutput = (drive) => (drive >= 1 ? 1 : (4 * drive) / (1 + drive) ** 2);
// shortcut: typical two-carrier C/IM, 11 dB at saturation and improving 2 dB per dB of backoff. Replace with a measured tube curve if one is ever available.
export const carrierToImDb = (drive) => Math.max(9, 11 - 2 * dB(drive));
const constantEnvelope = (i) => i.on && (i.kind === 'cw' || i.kind === 'swept');
const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

// The instantaneous band the interferer occupies, in MHz from the transponder center.
export function interfererBand(i, tS = 0) {
  if (!i.on) return null;
  if (i.kind === 'barrage') return [i.offsetMHz - i.wideMHz / 2, i.offsetMHz + i.wideMHz / 2];
  if (i.kind === 'partial') return [i.offsetMHz - i.bwMHz / 2, i.offsetMHz + i.bwMHz / 2];
  if (i.kind === 'cw') return [i.offsetMHz, i.offsetMHz]; // An unmodulated tone has no bandwidth.
  if (i.kind === 'narrow') return [i.offsetMHz - i.narrowMHz / 2, i.offsetMHz + i.narrowMHz / 2];
  const phase = (tS / i.sweepS) % 1;
  const position = i.sweepShape === 'saw' ? phase : 1 - Math.abs(2 * phase - 1);
  const center = i.offsetMHz + i.spanMHz * (position - 0.5);
  return [center - i.sweepWidthMHz / 2, center + i.sweepWidthMHz / 2];
}

const raisedCosine = (f, center, rs) => {
  const a = 0.2, x = Math.abs(f - center), edge1 = (rs * (1 - a)) / 2, edge2 = (rs * (1 + a)) / 2;
  if (x <= edge1) return 1;
  if (x >= edge2) return 0;
  return 0.5 * (1 + Math.cos((Math.PI / (a * rs)) * (x - edge1)));
};

// Share of the interferer's power that passes the carrier's matched filter.
function matchedShare(band, center, rs) {
  if (!band) return 0;
  if (band[0] === band[1]) return raisedCosine(band[0], center, rs);
  const n = 64, step = (band[1] - band[0]) / n;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += raisedCosine(band[0] + (k + 0.5) * step, center, rs);
  return sum / n;
}

const fractionIn = (band, lo, hi) => {
  if (!band) return 0;
  if (band[0] === band[1]) return band[0] >= lo && band[0] <= hi ? 1 : 0;
  return overlap(band[0], band[1], lo, hi) / (band[1] - band[0]);
};

function transponder(p, tS) {
  const nominal = lin(-p.iboDb) / 2;
  const carrier = nominal * lin(p.trimDb), neighbor = p.neighborOn ? nominal * lin(p.neighborTrimDb) : 0;
  const noisePerMHz = nominal / lin(UPLINK_CN_DB) / RS_MHZ;
  const band = interfererBand(p.interferer, tS);
  const iPower = p.interferer.on ? nominal * lin(p.interferer.icDb) : 0;
  const upI = p.interferer.path === 'uplink' ? iPower * fractionIn(band, -TP_HALF_MHZ, TP_HALF_MHZ) : 0;
  const noise = noisePerMHz * 2 * TP_HALF_MHZ;
  const pin = carrier + neighbor + noise + upI;
  // ALC holds the tube's total drive constant, so a stronger input lowers the gain ahead of the tube.
  const drive = p.alc ? lin(-p.iboDb) : pin;
  const pout = twtaOutput(drive);
  const ratio = pout / pin;
  const cimDb = carrierToImDb(drive);
  // Limiter suppression: near saturation a dominant tone pushes weak signals down up to 6 dB, a noise-like signal about 1 dB.
  const suppressDb = (constantEnvelope(p.interferer) ? 6 : 1) * (upI / pin) * Math.min(1, drive);
  const weak = lin(-suppressDb);
  return { nominal, carrier, neighbor, noise, noisePerMHz, band, iPower, upI, pin, drive, pout, ratio, weak, cimDb };
}

function carrierAt(tp, p, centerMHz, rs, inputPower, site, clearOut, tS, otherMHz = 0, otherRs = RS_MHZ, otherPower = 0) {
  const lo = centerMHz - rs / 2, hi = centerMHz + rs / 2;
  const isA = site === 'A';
  const rain = isA ? p.rainDb : 0, mispoint = isA ? p.mispointDb : 0;
  const loss = lin(-(rain + mispoint));
  const c = inputPower * tp.ratio * tp.weak * loss;
  const nUp = tp.noisePerMHz * rs * tp.ratio * tp.weak * loss;
  const nDown = lin(-DOWNLINK_CN_AT_SAT_DB) * (rs / RS_MHZ) * (1 + (RAIN_TEMP_K * (1 - lin(-rain))) / SYSTEM_TEMP_K);
  const im = c / lin(tp.cimDb);
  const band = interfererBand(p.interferer, tS);
  const inBand = matchedShare(band, centerMHz, rs);
  const iUp = p.interferer.on && p.interferer.path === 'uplink' ? tp.iPower * inBand * tp.ratio * loss : 0;
  const iDown = p.interferer.on && p.interferer.path === 'downlink' && isA ? clearOut * lin(p.interferer.icDb) * inBand : 0;
  // Two carriers placed on top of each other interfere just like any other signal.
  const iCarrier = (otherPower * tp.ratio * tp.weak * loss * overlap(lo, hi, otherMHz - otherRs / 2, otherMHz + otherRs / 2)) / otherRs;
  const interference = iUp + iDown + iCarrier;
  const total = nUp + nDown + im + interference;
  const esn0 = dB(c / total);
  return {
    c, esn0, iDb: interference > 0 ? dB(c / interference) : Infinity,
    cnUp: dB(c / nUp), cnDown: dB(c / nDown), cim: dB(c / im),
    // A tone is a line, not a raised floor. Noise-like interference does lift the measured floor.
    floor: (nUp + nDown + (constantEnvelope(p.interferer) ? 0 : iUp + iDown)) / rs,
  };
}

const stateOf = (margin) => (margin >= 1 ? 'Locked' : margin >= 0 ? 'Marginal' : 'Lost');

// Levels are reported against the same link with no interference, rain or mispointing.
export function evaluate(params, tS = 0) {
  const p = { ...DEFAULTS, ...params, interferer: { ...DEFAULTS.interferer, ...params.interferer } };
  const clearP = { ...p, iboDb: DEFAULTS.iboDb, alc: false, rainDb: 0, mispointDb: 0, trimDb: 0, neighborTrimDb: 0, interferer: { ...p.interferer, on: false } };
  const tp = transponder(p, tS), clearTp = transponder(clearP, 0), quietTp = transponder({ ...p, interferer: { ...p.interferer, on: false } }, 0);
  const clearOut = clearTp.carrier * clearTp.ratio;
  const need = MODCODS[p.modcod];
  const reference = carrierAt(clearTp, clearP, p.carrierMHz, p.rsMHz, clearTp.carrier, 'B', clearOut, 0);
  const sites = {};
  for (const site of ['A', 'B']) {
    const own = carrierAt(tp, p, p.carrierMHz, p.rsMHz, tp.carrier, site, clearOut, tS, p.neighborMHz, p.neighborRsMHz, tp.neighbor);
    const other = p.neighborOn ? carrierAt(tp, p, p.neighborMHz, p.neighborRsMHz, tp.neighbor, site, clearOut, tS, p.carrierMHz, p.rsMHz, tp.carrier) : null;
    const margin = own.esn0 - need;
    sites[site] = {
      ...own, margin, state: stateOf(margin),
      carrierDeltaDb: dB(own.c / reference.c), floorDeltaDb: dB(own.floor / reference.floor),
      neighborEsn0: other?.esn0 ?? null, neighborMargin: other ? other.esn0 - need : null, neighborState: other ? stateOf(other.esn0 - need) : 'Off',
    };
  }
  return {
    params: p, need, sites, tp,
    outputDb: dB(tp.pout), inputBackoffDb: -dB(tp.pin),
    robbedDb: dB((quietTp.ratio * quietTp.weak) / (tp.ratio * tp.weak)),
    interfererShareDb: tp.upI > 0 ? dB(tp.upI / tp.pin) : null,
    shares: shareOf(tp),
  };
}

// Share of transponder output, including the extra suppression of weak signals.
function shareOf(tp) {
  const carrier = tp.carrier * tp.weak, neighbor = tp.neighbor * tp.weak, noise = tp.noise * tp.weak, total = carrier + neighbor + noise + tp.upI;
  return { carrier: carrier / total, neighbor: neighbor / total, interference: tp.upI / total, noise: noise / total };
}

// A swept interferer only hurts while crossing the carrier, so report the share of time locked.
export function lockShare(params, site = 'A', samples = 96) {
  const sweepS = params.interferer?.sweepS ?? DEFAULTS.interferer.sweepS;
  let locked = 0;
  for (let i = 0; i < samples; i++) if (evaluate(params, (i / samples) * sweepS).sites[site].margin >= 0) locked++;
  return locked / samples;
}

export const VIEWS = {
  input: { name: 'Satellite input', centerMHz: UP_CENTER_MHZ },
  output: { name: 'Transponder output', centerMHz: DOWN_CENTER_MHZ },
  A: { name: 'Site A receiver', centerMHz: DOWN_CENTER_MHZ },
  B: { name: 'Site B receiver', centerMHz: DOWN_CENTER_MHZ },
};

// Power spectral density in dB, with 0 dB at the clear-sky carrier for that test point.
export function spectrum(params, view, tS, bins = 512, spanHalf = 26) {
  const r = evaluate(params, tS), p = r.params, tp = r.tp;
  const clear = evaluate({ ...p, iboDb: DEFAULTS.iboDb, alc: false, rainDb: 0, mispointDb: 0, trimDb: 0, neighborTrimDb: 0, interferer: { ...p.interferer, on: false } });
  const isInput = view === 'input', isSite = view === 'A' || view === 'B';
  const loss = view === 'A' ? lin(-(p.rainDb + p.mispointDb)) : 1;
  const gain = isInput ? 1 : tp.ratio * tp.weak * loss;
  const ref = (isInput ? clear.tp.carrier : clear.tp.carrier * clear.tp.ratio) / RS_MHZ;
  const band = interfererBand(p.interferer, tS);
  const rainNoise = view === 'A' ? 1 + (RAIN_TEMP_K * (1 - lin(-p.rainDb))) / SYSTEM_TEMP_K : 1;
  const downNoise = isSite ? (lin(-DOWNLINK_CN_AT_SAT_DB) * rainNoise) / RS_MHZ : 0;
  // The analyzer resolves one bin, so a tone puts all its power there and reads as a line.
  const binMHz = (2 * spanHalf) / (bins - 1), firstBin = band ? Math.round((band[0] + spanHalf) / binMHz) : 0;
  const lastBin = band ? Math.max(firstBin, Math.round((band[1] + spanHalf) / binMHz)) : -1, shownMHz = (lastBin - firstBin + 1) * binMHz;
  const iDensity = band ? (tp.iPower / shownMHz) / (isInput ? 1 : tp.weak) : 0; // The interferer itself is not suppressed.
  const out = new Float64Array(bins);
  for (let n = 0; n < bins; n++) {
    const f = -spanHalf + (2 * spanHalf * n) / (bins - 1);
    const filter = isInput ? 1 : 1 / (1 + (f / TP_HALF_MHZ) ** 16);
    let psd = (tp.carrier * raisedCosine(f, p.carrierMHz, p.rsMHz)) / p.rsMHz + (tp.neighbor * raisedCosine(f, p.neighborMHz, p.neighborRsMHz)) / p.neighborRsMHz;
    // Spectral regrowth: third-order energy spreads to about three times the carrier width.
    if (!isInput) psd += ((tp.carrier * shoulder(f, p.carrierMHz, p.rsMHz)) / p.rsMHz + (tp.neighbor * shoulder(f, p.neighborMHz, p.neighborRsMHz)) / p.neighborRsMHz) / lin(tp.cimDb);
    psd += tp.noisePerMHz;
    if (band && p.interferer.path === 'uplink' && n >= firstBin && n <= lastBin) psd += iDensity;
    let level = psd * gain * filter + downNoise;
    if (band && p.interferer.path === 'downlink' && view === 'A' && n >= firstBin && n <= lastBin) level += (clear.tp.carrier * clear.tp.ratio * lin(p.interferer.icDb)) / shownMHz;
    out[n] = dB(level / ref);
  }
  return { db: out, lowMHz: -spanHalf, highMHz: spanHalf, centerMHz: VIEWS[view].centerMHz, band };
}

const shoulder = (f, center, rs) => {
  const x = Math.abs(f - center) / (rs * 1.2);
  return x < 1.5 ? 1 - x / 1.5 : 0;
};

// Received symbols for the IQ plot. A constant-envelope tone or sweep adds a rotating phasor, which draws a ring around
// each point. Everything else is noise-like and makes a round cloud.
export function iqSamples(r, site, count = 900, rand = Math.random) {
  const s = r.sites[site], i = r.params.interferer, ideal = constellation(r.params.modcod);
  const narrow = constantEnvelope(i);
  const iPower = Number.isFinite(s.iDb) ? lin(-s.iDb) : 0;
  const noise = lin(-s.cnUp) + lin(-s.cnDown) + lin(-s.cim) + (narrow ? 0 : iPower);
  const sigma = Math.sqrt(noise / 2), tone = narrow ? Math.sqrt(iPower) : 0;
  const samples = [];
  for (let n = 0; n < count; n++) {
    const p = ideal[Math.floor(rand() * ideal.length)], a = 2 * Math.PI * rand();
    samples.push({
      i: p.i + sigma * gaussian(rand) + tone * Math.cos(a), q: p.q + sigma * gaussian(rand) + tone * Math.sin(a),
      refI: p.i, refQ: p.q,
    });
  }
  return { samples, ideal, merDb: merDb(samples) };
}

// Each case is a set of conditions whose symptoms the learner has to read.
export const CASES = [
  {
    id: 'rain', answer: 'rain', set: { rainDb: 6 },
    why: 'Only Site A dropped, and its noise floor rose. Rain both absorbs the signal and radiates thermal noise into the antenna, which is what separates it from a pointing error. Check the weather and the beacon at Site A.',
  },
  {
    id: 'mispoint', answer: 'mispoint', set: { mispointDb: 6 },
    why: 'Only Site A dropped, but its noise floor stayed about the same or fell slightly. That points to the antenna rather than the atmosphere. Check tracking and peak the antenna on the beacon.',
  },
  {
    id: 'uplinkI', answer: 'uplinkBand', set: { interferer: { on: true, kind: 'partial', path: 'uplink', icDb: 4, offsetMHz: -8, bwMHz: 6 } },
    why: 'Both sites lost margin on the same carrier, so the source entered at the satellite. The analyzer shows a raised block of energy with width, which means a modulated signal. Capture the spectrum and contact the satellite operator, who can investigate and geolocate it.',
  },
  {
    id: 'uplinkTone', answer: 'uplinkTone', set: { interferer: { on: true, kind: 'cw', path: 'uplink', icDb: 4, offsetMHz: -8 } },
    why: 'Both sites are hit, so it entered at the satellite. The analyzer shows one thin line on the carrier, and the waterfall shows a steady vertical stripe. That is an unmodulated tone. A common accidental source is a terminal transmitting an unmodulated carrier.',
  },
  {
    id: 'sweptI', answer: 'swept', set: { interferer: { on: true, kind: 'swept', path: 'uplink', icDb: 2, offsetMHz: 0, spanMHz: 30, sweepS: 6 } },
    why: 'Service drops and returns on a repeating schedule at both sites. A single analyzer sweep can miss it, but the waterfall shows a line moving across the transponder. Time-based views are what catch intermittent interference.',
  },
  {
    id: 'healthy', answer: 'none', set: {},
    why: 'Both sites are locked with healthy margin, and the spectrum shows only the two expected carriers. Not every ticket is an RF fault. Check the customer’s equipment and configuration before escalating.',
  },
  {
    id: 'downlinkI', answer: 'downlink', set: { interferer: { on: true, kind: 'cw', path: 'downlink', icDb: -6, offsetMHz: -8 } },
    why: 'Only Site A is affected and its carrier level is unchanged, but a new signal sits on top of it. The problem is local to the receive site. Look for nearby emitters, and check cabling and the LNB.',
  },
  {
    id: 'overdrive', answer: 'overdrive', set: { iboDb: -10 },
    why: 'Both sites and both carriers lost margin even though their received level went up, and no separate signal appeared. The transponder is being driven past saturation, so intermodulation is the limit. Reduce drive to restore backoff.',
  },
];

export const ANSWERS = {
  rain: 'Rain fade at Site A', mispoint: 'Antenna mispointing at Site A', uplinkTone: 'CW tone on the uplink',
  uplinkBand: 'Modulated signal on the uplink', swept: 'Swept interference', downlink: 'Local interference at Site A',
  overdrive: 'Transponder overdrive', none: 'No RF fault',
};
