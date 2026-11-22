// Link model for a fictional bent-pipe satellite. Interference is set relative to the carrier,
// so this teaches effects and diagnosis without any transmit-power or targeting inputs.
import { amplifier, createGrid, createSignal, levelOf } from '../../lib/tones.js';

export const RS_MHZ = 5, OCCUPIED_MHZ = 6, TP_HALF_MHZ = 18;
export const UP_CENTER_MHZ = 14250, DOWN_CENTER_MHZ = 12500;
const UPLINK_CN_DB = 22, DOWNLINK_CN_AT_SAT_DB = 25, SYSTEM_TEMP_K = 150, RAIN_TEMP_K = 275, IP3_ABOVE_SAT_DB = 4.26;

// DVB-S2 quasi-error-free Es/N0 thresholds, ETSI EN 302 307-1.
export const MODCODS = {
  'QPSK 1/2': 1.0, 'QPSK 3/4': 4.03, '8PSK 2/3': 6.62, '8PSK 3/4': 7.91, '16APSK 3/4': 10.21, '32APSK 3/4': 12.73,
};

export const DEFAULTS = {
  carrierMHz: -8, neighborMHz: 8, modcod: '16APSK 3/4', iboDb: 3, trimDb: 0, rainDb: 0, mispointDb: 0,
  interferer: { on: false, kind: 'cw', path: 'uplink', icDb: -10, offsetMHz: -8, bwMHz: 12, sweepS: 8 },
};

const lin = (db) => 10 ** (db / 10);
const dB = (x) => 10 * Math.log10(x);

// Carrier-to-third-order ratio from the Mixer Lab engine, with saturation at 0 dBm. Cached for animation.
const twoToneGrid = createGrid([{ id: 'F1', hz: 1000e6 }, { id: 'F2', hz: 1001e6 }]);
const cimCache = new Map();
function carrierToIm(totalInput) {
  const key = Math.round(dB(totalInput) * 20);
  if (!cimCache.has(key)) {
    const dbm = key / 20 - 3;
    const out = amplifier(createSignal(twoToneGrid, [{ id: 'F1', dbm }, { id: 'F2', dbm }]), { gainDb: 0, oip3Dbm: IP3_ABOVE_SAT_DB });
    cimCache.set(key, levelOf(out, [1, 0]) - levelOf(out, [2, -1]));
  }
  return cimCache.get(key);
}
const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

// The instantaneous band the interferer occupies, in MHz from the transponder center.
export function interfererBand(i, tS = 0) {
  if (!i.on) return null;
  if (i.kind === 'barrage') return [-TP_HALF_MHZ, TP_HALF_MHZ];
  if (i.kind === 'partial') return [i.offsetMHz - i.bwMHz / 2, i.offsetMHz + i.bwMHz / 2];
  let center = i.offsetMHz;
  if (i.kind === 'swept') {
    const phase = (tS / i.sweepS) % 1;
    center += i.bwMHz * (1 - Math.abs(2 * phase - 1) - 0.5);
  }
  return [center - 0.1, center + 0.1];
}

const fractionIn = (band, lo, hi) => (band ? overlap(band[0], band[1], lo, hi) / (band[1] - band[0]) : 0);

function transponder(p, tS) {
  const nominal = lin(-p.iboDb) / 2;
  const carrier = nominal * lin(p.trimDb), neighbor = nominal;
  const noisePerMHz = nominal / lin(UPLINK_CN_DB) / RS_MHZ;
  const band = interfererBand(p.interferer, tS);
  const iPower = p.interferer.on ? nominal * lin(p.interferer.icDb) : 0;
  const upI = p.interferer.path === 'uplink' ? iPower * fractionIn(band, -TP_HALF_MHZ, TP_HALF_MHZ) : 0;
  const pin = carrier + neighbor + noisePerMHz * 2 * TP_HALF_MHZ + upI;
  const pout = pin / (1 + pin); // The same limiter as Mixer Lab, written in power. Saturated output is 1.
  const ratio = pout / pin;
  const cimDb = carrierToIm(pin);
  return { nominal, carrier, neighbor, noisePerMHz, band, iPower, upI, pin, pout, ratio, cimDb };
}

function carrierAt(tp, p, centerMHz, inputPower, site, clearOut, tS, otherMHz = 0, otherPower = 0) {
  const lo = centerMHz - RS_MHZ / 2, hi = centerMHz + RS_MHZ / 2;
  const isA = site === 'A';
  const rain = isA ? p.rainDb : 0, mispoint = isA ? p.mispointDb : 0;
  const loss = lin(-(rain + mispoint));
  const c = inputPower * tp.ratio * loss;
  const nUp = tp.noisePerMHz * RS_MHZ * tp.ratio * loss;
  const nDown = lin(-DOWNLINK_CN_AT_SAT_DB) * (1 + (RAIN_TEMP_K * (1 - lin(-rain))) / SYSTEM_TEMP_K);
  const im = (inputPower * tp.ratio * loss) / lin(tp.cimDb);
  const band = interfererBand(p.interferer, tS);
  const inBand = fractionIn(band, lo, hi);
  const iUp = p.interferer.on && p.interferer.path === 'uplink' ? tp.iPower * inBand * tp.ratio * loss : 0;
  const iDown = p.interferer.on && p.interferer.path === 'downlink' && isA ? clearOut * lin(p.interferer.icDb) * inBand : 0;
  // Two carriers placed on top of each other interfere just like any other signal.
  const iCarrier = (otherPower * tp.ratio * loss * overlap(lo, hi, otherMHz - RS_MHZ / 2, otherMHz + RS_MHZ / 2)) / RS_MHZ;
  const interference = iUp + iDown + iCarrier;
  const total = nUp + nDown + im + interference;
  const esn0 = dB(c / total);
  return {
    c, esn0, iDb: interference > 0 ? dB(c / interference) : Infinity,
    cnUp: dB(c / nUp), cnDown: dB(c / nDown), cim: dB(c / im),
    floor: nUp / RS_MHZ + nDown / RS_MHZ,
  };
}

const stateOf = (margin) => (margin >= 1 ? 'Locked' : margin >= 0 ? 'Marginal' : 'Lost');

// Levels are reported against the same link with no interference, rain or mispointing.
export function evaluate(params, tS = 0) {
  const p = { ...DEFAULTS, ...params, interferer: { ...DEFAULTS.interferer, ...params.interferer } };
  const clearP = { ...p, iboDb: DEFAULTS.iboDb, rainDb: 0, mispointDb: 0, trimDb: 0, interferer: { ...p.interferer, on: false } };
  const tp = transponder(p, tS), clearTp = transponder(clearP, 0), quietTp = transponder({ ...p, interferer: { ...p.interferer, on: false } }, 0);
  const clearOut = clearTp.carrier * clearTp.ratio;
  const need = MODCODS[p.modcod];
  const reference = carrierAt(clearTp, clearP, p.carrierMHz, clearTp.carrier, 'B', clearOut, 0);
  const sites = {};
  for (const site of ['A', 'B']) {
    const own = carrierAt(tp, p, p.carrierMHz, tp.carrier, site, clearOut, tS, p.neighborMHz, tp.neighbor);
    const other = carrierAt(tp, p, p.neighborMHz, tp.neighbor, site, clearOut, tS, p.carrierMHz, tp.carrier);
    const margin = own.esn0 - need;
    sites[site] = {
      ...own, margin, state: stateOf(margin),
      carrierDeltaDb: dB(own.c / reference.c), floorDeltaDb: dB(own.floor / reference.floor),
      neighborEsn0: other.esn0, neighborMargin: other.esn0 - need, neighborState: stateOf(other.esn0 - need),
    };
  }
  return {
    params: p, need, sites, tp,
    outputDb: dB(tp.pout), inputBackoffDb: -dB(tp.pin),
    robbedDb: dB(quietTp.ratio / tp.ratio),
    interfererShareDb: tp.upI > 0 ? dB(tp.upI / tp.pin) : null,
  };
}

// A swept interferer only hurts while crossing the carrier, so report the share of time locked.
export function lockShare(params, site = 'A', samples = 96) {
  const sweepS = params.interferer?.sweepS ?? DEFAULTS.interferer.sweepS;
  let locked = 0;
  for (let i = 0; i < samples; i++) if (evaluate(params, (i / samples) * sweepS).sites[site].margin >= 0) locked++;
  return locked / samples;
}

const raisedCosine = (f, center) => {
  const a = 0.2, x = Math.abs(f - center), edge1 = (RS_MHZ * (1 - a)) / 2, edge2 = (RS_MHZ * (1 + a)) / 2;
  if (x <= edge1) return 1;
  if (x >= edge2) return 0;
  return 0.5 * (1 + Math.cos((Math.PI / (a * RS_MHZ)) * (x - edge1)));
};

export const VIEWS = {
  input: { name: 'Satellite input', centerMHz: UP_CENTER_MHZ },
  output: { name: 'Transponder output', centerMHz: DOWN_CENTER_MHZ },
  A: { name: 'Site A receiver', centerMHz: DOWN_CENTER_MHZ },
  B: { name: 'Site B receiver', centerMHz: DOWN_CENTER_MHZ },
};

// Power spectral density in dB, with 0 dB at the clear-sky carrier for that test point.
export function spectrum(params, view, tS, bins = 512, spanHalf = 26) {
  const r = evaluate(params, tS), p = r.params, tp = r.tp;
  const clear = evaluate({ ...p, iboDb: DEFAULTS.iboDb, rainDb: 0, mispointDb: 0, trimDb: 0, interferer: { ...p.interferer, on: false } });
  const isInput = view === 'input', isSite = view === 'A' || view === 'B';
  const loss = view === 'A' ? lin(-(p.rainDb + p.mispointDb)) : 1;
  const gain = isInput ? 1 : tp.ratio * loss;
  const ref = (isInput ? clear.tp.carrier : clear.tp.carrier * clear.tp.ratio) / RS_MHZ;
  const band = interfererBand(p.interferer, tS);
  const rainNoise = view === 'A' ? 1 + (RAIN_TEMP_K * (1 - lin(-p.rainDb))) / SYSTEM_TEMP_K : 1;
  const downNoise = isSite ? (lin(-DOWNLINK_CN_AT_SAT_DB) * rainNoise) / RS_MHZ : 0;
  const iDensity = band ? tp.iPower / (band[1] - band[0]) : 0;
  const out = new Float64Array(bins);
  for (let n = 0; n < bins; n++) {
    const f = -spanHalf + (2 * spanHalf * n) / (bins - 1);
    const filter = isInput ? 1 : 1 / (1 + (f / TP_HALF_MHZ) ** 16);
    let psd = (tp.carrier * raisedCosine(f, p.carrierMHz) + tp.neighbor * raisedCosine(f, p.neighborMHz)) / RS_MHZ;
    // Spectral regrowth: third-order energy spreads to about three times the carrier width.
    if (!isInput) psd += ((tp.carrier * shoulder(f, p.carrierMHz) + tp.neighbor * shoulder(f, p.neighborMHz)) / RS_MHZ) / lin(tp.cimDb);
    psd += tp.noisePerMHz;
    if (band && p.interferer.path === 'uplink' && f >= band[0] && f <= band[1]) psd += iDensity;
    let level = psd * gain * filter + downNoise;
    if (band && p.interferer.path === 'downlink' && view === 'A' && f >= band[0] && f <= band[1]) level += (clear.tp.carrier * clear.tp.ratio * lin(p.interferer.icDb)) / (band[1] - band[0]);
    out[n] = dB(level / ref);
  }
  return { db: out, lowMHz: -spanHalf, highMHz: spanHalf, centerMHz: VIEWS[view].centerMHz, band };
}

const shoulder = (f, center) => {
  const x = Math.abs(f - center) / OCCUPIED_MHZ;
  return x < 1.5 ? 1 - x / 1.5 : 0;
};

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
    id: 'uplinkI', answer: 'uplink', set: { interferer: { on: true, kind: 'partial', path: 'uplink', icDb: 4, offsetMHz: -8, bwMHz: 6 } },
    why: 'Both sites lost margin on the same carrier, while the other carrier stayed usable. Because every site sees it, the source entered at the satellite. Capture the spectrum and contact the satellite operator, who can investigate and geolocate it.',
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
  rain: 'Rain fade at Site A', mispoint: 'Antenna mispointing at Site A', uplink: 'Interference on the uplink',
  downlink: 'Local interference at Site A', overdrive: 'Transponder overdrive',
};
