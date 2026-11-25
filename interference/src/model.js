// Link model for a fictional bent-pipe satellite. Interference is set relative to the carrier,
// so this teaches effects and diagnosis without any transmit-power or targeting inputs.
import { constellation, gaussian, merDb } from '../../lib/constellation.js';
import { MODCODS, RELOCK_S, RELOCK_STEPS } from '../../lib/modcods.js';
import { DEMOD_HOLD_DB, RECEIVER_NAMES, receiverState } from '../../lib/receiver.js';
import { carrierToImDb, twtaOutput } from '../../lib/twta.js';

export const RS_MHZ = 5, TP_HALF_MHZ = 18;
export const UP_CENTER_MHZ = 14250, DOWN_CENTER_MHZ = 12500;
// Illustrative: a poorly aligned feed. A well-aligned one is typically 30 dB or better.
export const XPOL_ISOLATION_DB = 15;
const GOOD_ISOLATION_DB = 30;
// The beacon sits outside the transponder, as beacons usually do, and has its own path from the satellite.
export const BEACON_MHZ = 22;
const BEACON_DB = 10; // Illustrative display height of the beacon line.
// Illustrative: moving off peak toward a neighbor raises its signal faster than it lowers yours.
const ASI_DB_PER_POINTING_DB = 3, ASI_MAX_RISE_DB = 20;
const ALC_RANGE_DB = 15, UPLINK_CN_DB = 22, DOWNLINK_CN_AT_SAT_DB = 25, SYSTEM_TEMP_K = 150, RAIN_TEMP_K = 275;

export { carrierToImDb, MODCODS, twtaOutput };

export const DEFAULTS = {
  carrierMHz: -8, rsMHz: RS_MHZ, neighborOn: true, neighborMHz: 8, neighborRsMHz: RS_MHZ, neighborTrimDb: 0, neighborModcod: '16APSK 3/4',
  modcod: '16APSK 3/4', iboDb: 6, trimDb: 0, alc: false, rainDb: 0, mispointDb: 0,
  interferer: { on: false, source: 'none', kind: 'cw', path: 'uplink', icDb: -10, offsetMHz: -8, narrowMHz: 0.5, bwMHz: 12, wideMHz: 36, spanMHz: 30, sweepWidthMHz: 0, sweepS: 8, sweepShape: 'triangle' },
};

const lin = (db) => 10 ** (db / 10);
const dB = (x) => 10 * Math.log10(x);

const constantEnvelope = (i) => i.on && (i.kind === 'cw' || i.kind === 'swept');
const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
// A neighbor's signal comes through the same rain as yours, so rain does not change C/I much.
const asiRiseDb = (p) => (p.interferer.source === 'asi' ? Math.min(ASI_MAX_RISE_DB, p.mispointDb * ASI_DB_PER_POINTING_DB) - p.rainDb : 0);

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
  // Its attenuator has a finite range, so a large enough input change gets through.
  const alcDb = p.alc ? Math.max(-ALC_RANGE_DB, Math.min(ALC_RANGE_DB, -p.iboDb - dB(pin))) : 0;
  const drive = pin * lin(alcDb);
  const pout = twtaOutput(drive);
  const ratio = pout / pin;
  const cimDb = carrierToImDb(drive);
  // Limiter suppression: near saturation a dominant tone pushes weak signals down up to 6 dB, a noise-like signal about 1 dB.
  const suppressDb = (constantEnvelope(p.interferer) ? 6 : 1) * (upI / pin) * Math.min(1, drive);
  const weak = lin(-suppressDb);
  return { nominal, carrier, neighbor, noise, noisePerMHz, band, iPower, upI, pin, alcDb, drive, pout, ratio, weak, cimDb };
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
  const iDownPower = p.interferer.on && p.interferer.path === 'downlink' && isA ? clearOut * lin(p.interferer.icDb + asiRiseDb(p)) : 0;
  const iDown = iDownPower * inBand;
  // Two carriers placed on top of each other interfere just like any other signal.
  const iCarrier = (otherPower * tp.ratio * tp.weak * loss * overlap(lo, hi, otherMHz - otherRs / 2, otherMHz + otherRs / 2)) / otherRs;
  const interference = iUp + iDown + iCarrier;
  const total = nUp + nDown + im + interference;
  const esn0 = dB(c / total);
  // The floor is read just outside the carrier, so only noise-like energy that reaches there lifts it.
  const spread = band && band[1] > band[0] && !constantEnvelope(p.interferer) ? ((p.interferer.path === 'uplink' ? tp.iPower * tp.ratio * loss : iDownPower) / (band[1] - band[0])) : 0;
  const regrowth = (im / rs) * shoulder(centerMHz + rs * 0.65, centerMHz, rs); // Overdrive shoulders are what the analyzer sees there.
  const beside = regrowth + [centerMHz - rs * 0.65, centerMHz + rs * 0.65].reduce((sum, f) => sum + (band && f >= band[0] && f <= band[1] ? spread : 0), 0) / 2;
  return {
    c, esn0, iDb: interference > 0 ? dB(c / interference) : Infinity,
    cnUp: dB(c / nUp), cnDown: dB(c / nDown), cim: dB(c / im),
    // A tone is a line, not a raised floor. Noise-like interference does lift the measured floor.
    floor: (nUp + nDown) / rs + beside, inCarrier: (nUp + nDown + interference) / rs,
  };
}

const stateOf = (es, need) => RECEIVER_NAMES[receiverState(es, need)];

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
    const margin = own.esn0 - need, neighborNeed = MODCODS[p.neighborModcod];
    sites[site] = {
      ...own, margin, state: stateOf(own.esn0, need),
      beaconDeltaDb: site === 'A' ? 0 - p.rainDb - p.mispointDb : 0, // The beacon has its own path, so only propagation and pointing move it.
      // An uplink leak is on the satellite for everyone. A receive-feed leak exists only at that site.
      oppositePolDb: p.interferer.on && p.interferer.source === 'xpol' && (p.interferer.path === 'uplink' || site === 'A') ? XPOL_ISOLATION_DB : null,
      carrierDeltaDb: dB(own.c / reference.c), floorDeltaDb: dB(own.floor / reference.floor), inCarrierDeltaDb: dB(own.inCarrier / reference.inCarrier),
      neighborEsn0: other?.esn0 ?? null, neighborMargin: other ? other.esn0 - neighborNeed : null, neighborState: other ? stateOf(other.esn0, neighborNeed) : 'Off',
    };
  }
  return {
    params: p, need, sites, tp,
    outputDb: dB(tp.pout), inputBackoffDb: -dB(tp.pin),
    robbedDb: dB((quietTp.ratio * quietTp.weak) / (tp.ratio * tp.weak)),
    interfererShareDb: tp.upI > 0 ? dB(tp.upI / tp.pin) : null,
    inputShare: tp.upI / tp.pin,
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
// dwellS is the analyzer's time per trace, so a fast sweep paints a continuous track instead of dots.
// pol 'x' reads the opposite polarization, where your own signals arrive only through the feed's isolation.
export function spectrum(params, view, tS, bins = 512, spanHalf = 26, dwellS = 0, pol = 'co') {
  const r = evaluate(params, tS), p = r.params, tp = r.tp;
  const clear = evaluate({ ...p, iboDb: DEFAULTS.iboDb, alc: false, rainDb: 0, mispointDb: 0, trimDb: 0, neighborTrimDb: 0, interferer: { ...p.interferer, on: false } });
  const isInput = view === 'input', isSite = view === 'A' || view === 'B';
  const loss = view === 'A' ? lin(-(p.rainDb + p.mispointDb)) : 1;
  // The backoff control is a gain step after the satellite's input, so the input view is read ahead of it.
  const gain = isInput ? lin(p.iboDb - DEFAULTS.iboDb) : tp.ratio * tp.weak * loss;
  const ref = (isInput ? clear.tp.carrier : clear.tp.carrier * clear.tp.ratio) / RS_MHZ;
  const instant = interfererBand(p.interferer, tS);
  let band = instant;
  if (band && p.interferer.kind === 'swept' && dwellS > 0) {
    const before = interfererBand(p.interferer, Math.max(0, tS - dwellS));
    // A sawtooth reset jumps across the band, and that jump is not swept energy.
    if (Math.abs(before[0] - band[0]) < p.interferer.spanMHz / 2) band = [Math.min(before[0], band[0]), Math.max(before[1], band[1])];
  }
  const rainNoise = view === 'A' ? 1 + (RAIN_TEMP_K * (1 - lin(-p.rainDb))) / SYSTEM_TEMP_K : 1;
  const downNoise = isSite ? (lin(-DOWNLINK_CN_AT_SAT_DB) * rainNoise) / RS_MHZ : 0;
  // The analyzer resolves one bin, so a tone puts all its power there and reads as a line.
  const binMHz = (2 * spanHalf) / (bins - 1), bin = (mhz) => Math.round((mhz + spanHalf) / binMHz);
  const firstBin = band ? bin(band[0]) : 0, lastBin = band ? Math.max(firstBin, bin(band[1])) : -1;
  // Density comes from the instantaneous width: a peak detector catches a swept tone at full height in every bin it
  // crosses during the dwell, so the track stays a line instead of a lower block with width.
  const shownMHz = instant ? (Math.max(bin(instant[0]), bin(instant[1])) - bin(instant[0]) + 1) * binMHz : 1;
  const iDensity = band ? (tp.iPower / shownMHz) / (isInput ? 1 : tp.weak) : 0; // The interferer itself is not suppressed.
  const xSource = p.interferer.source === 'xpol', opposite = pol === 'x';
  // A bad feed leaks at 15 dB. Where the feeds are good, your signals are 30 dB down on the other polarization.
  const own = opposite ? lin(-(xSource && (p.interferer.path === 'uplink' || view === 'A') ? XPOL_ISOLATION_DB : GOOD_ISOLATION_DB)) : 1;
  // A cross-pol signal is a real carrier on the other polarization, so there it is stronger by the isolation, at every site.
  const onSatellite = p.interferer.path === 'uplink' || (opposite && xSource);
  const iScale = !opposite ? 1 : xSource ? lin(XPOL_ISOLATION_DB) : own;
  const beaconBin = isInput ? -1 : bin(BEACON_MHZ);
  const out = new Float64Array(bins);
  for (let n = 0; n < bins; n++) {
    const f = -spanHalf + (2 * spanHalf * n) / (bins - 1);
    const filter = isInput ? 1 : 1 / (1 + (f / TP_HALF_MHZ) ** 16);
    let psd = (tp.carrier * raisedCosine(f, p.carrierMHz, p.rsMHz)) / p.rsMHz + (tp.neighbor * raisedCosine(f, p.neighborMHz, p.neighborRsMHz)) / p.neighborRsMHz;
    // Spectral regrowth: third-order energy spreads to about three times the carrier width.
    if (!isInput) psd += ((tp.carrier * shoulder(f, p.carrierMHz, p.rsMHz)) / p.rsMHz + (tp.neighbor * shoulder(f, p.neighborMHz, p.neighborRsMHz)) / p.neighborRsMHz) / lin(tp.cimDb);
    psd = psd * own + tp.noisePerMHz;
    if (band && onSatellite && n >= firstBin && n <= lastBin) psd += iDensity * iScale;
    let level = psd * gain * filter + downNoise;
    if (band && !onSatellite && view === 'A' && n >= firstBin && n <= lastBin) level += (own * clear.tp.carrier * clear.tp.ratio * lin(p.interferer.icDb + asiRiseDb(p))) / shownMHz;
    if (n === beaconBin) level += ref * lin(BEACON_DB) * own * loss; // Rain and pointing move it, the transponder does not.
    out[n] = dB(level / ref);
  }
  return { db: out, lowMHz: -spanHalf, highMHz: spanHalf, centerMHz: VIEWS[view].centerMHz, band };
}

// A hit that keeps demod lock only costs FEC time. One that loses the demod costs a full reacquisition.
const recoveryS = (site) => (site.esn0 < DEMOD_HOLD_DB ? RELOCK_S : RELOCK_STEPS.fecLock);

// The state to display during a sweep, including the wait to recover after a hit.
export function liveState(params, siteName, tS) {
  const now = evaluate(params, tS).sites[siteName], i = params.interferer;
  if (!i?.on || i.kind !== 'swept' || now.margin < 0) return now.state;
  const period = i.sweepS, step = 0.05;
  for (let back = step; back <= RELOCK_S; back += step) {
    const then = evaluate(params, (((tS - back) % period) + period) % period).sites[siteName];
    if (then.margin < 0 && back < recoveryS(then)) return 'Reacquiring';
  }
  return now.state;
}

// Time a modem can actually use, because each loss of lock costs a reacquisition afterward.
export function usableShare(params, site = 'A', samples = 192) {
  const sweepS = params.interferer?.sweepS ?? DEFAULTS.interferer.sweepS, dt = sweepS / samples;
  let wait = 0, usable = 0;
  // The first pass only settles the relock timer, because the pattern repeats.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < samples; i++) {
      const s = evaluate(params, (i / samples) * sweepS).sites[site];
      if (s.margin < 0) wait = Math.max(wait, recoveryS(s));
      else if (wait > 0) wait -= dt;
      else if (pass === 1) usable++;
    }
  }
  return usable / samples;
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
  return { samples, ideal, merDb: merDb(samples, ideal) };
}

// Each case is a set of conditions whose symptoms the learner has to read.
export const CASES = [
  {
    id: 'rain', answer: 'rain', evidence: 'floorUp', set: { rainDb: 11 }, // Same fade range as mispointing, so only the analyzer floor separates them.
    why: 'Only Site A dropped, and its noise floor rose. Rain both absorbs the signal and radiates thermal noise into the antenna, which is what separates it from a pointing error. Check the weather and the beacon at Site A.',
  },
  {
    id: 'mispoint', answer: 'mispoint', evidence: 'floorFlat', set: { mispointDb: 11 },
    why: 'Only Site A dropped, but its noise floor stayed about the same or fell slightly. That points to the antenna rather than the atmosphere. Check tracking and peak the antenna on the beacon.',
  },
  {
    id: 'uplinkI', answer: 'uplinkBand', evidence: 'block', set: { interferer: { on: true, kind: 'partial', path: 'uplink', icDb: 4, offsetMHz: -8, bwMHz: 6 } },
    why: 'Both sites lost margin on the same carrier, so the source entered at the satellite. The analyzer shows a raised block of energy with width, which means a modulated signal. Capture the spectrum and contact the satellite operator, who can investigate and geolocate it.',
  },
  {
    id: 'uplinkTone', answer: 'uplinkTone', evidence: 'line', set: { interferer: { on: true, kind: 'cw', path: 'uplink', icDb: -6, offsetMHz: -8 } },
    why: 'Both sites are hit, so it entered at the satellite. The analyzer shows one thin line on the carrier, and the waterfall shows a steady vertical stripe. That is an unmodulated tone. A common accidental source is a terminal transmitting an unmodulated carrier.',
  },
  {
    id: 'sweptI', answer: 'swept', evidence: 'moving', set: { interferer: { on: true, kind: 'swept', path: 'uplink', icDb: 2, offsetMHz: 0, spanMHz: 30, sweepS: 6 } },
    why: 'Service drops and returns on a repeating schedule at both sites. A single analyzer sweep can miss it, but the waterfall shows a line moving across the transponder. Time-based views are what catch intermittent interference.',
  },
  {
    id: 'xpolI', answer: 'xpol', evidence: 'opposite', set: { interferer: { on: true, source: 'xpol', kind: 'partial', path: 'uplink', icDb: -3, offsetMHz: -6, bwMHz: 8 } },
    why: 'Both sites see a signal with width, so it is on the satellite. The opposite-polarization row shows the same signal 15 dB stronger on the other polarization. That is a carrier on the other polarization leaking across through only 15 dB of isolation, often from a poorly aligned uplink feed. Give the operator both polarization readings.',
  },
  {
    id: 'asiI', answer: 'asi', evidence: 'beaconBlock', set: { mispointDb: 2, interferer: { on: true, source: 'asi', kind: 'partial', path: 'downlink', icDb: -14, offsetMHz: -8, bwMHz: 10 } },
    why: 'Only Site A is affected, there is a signal with width, and its beacon is also slightly down. A local emitter would leave the beacon alone. A small or mispointed dish moves its main beam toward a neighboring satellite and receives that satellite’s carriers. Repeak the antenna, then see whether the signal falls.',
  },
  {
    id: 'healthy', answer: 'none', evidence: 'clean', set: {},
    why: 'Both sites are locked with healthy margin, and the spectrum shows only the two expected carriers. Not every ticket is an RF fault. Check the customer’s equipment and configuration before escalating.',
  },
  {
    id: 'downlinkI', answer: 'downlink', evidence: 'localLine', set: { interferer: { on: true, kind: 'cw', path: 'downlink', icDb: -6, offsetMHz: -8 } },
    why: 'Only Site A is affected and its carrier level is unchanged, but a new signal sits on top of it. The problem is local to the receive site. Look for nearby emitters, and check cabling and the LNB.',
  },
  {
    id: 'overdrive', answer: 'overdrive', evidence: 'shoulders', set: { iboDb: -10 },
    why: 'Both sites and both carriers lost margin even though their received level went up, and no separate signal appeared. The transponder is being driven past saturation, so intermodulation is the limit. Reduce drive to restore backoff.',
  },
  {
    id: 'robbing', answer: 'robbing', evidence: 'between', set: { interferer: { on: true, kind: 'cw', path: 'uplink', icDb: 10, offsetMHz: 0 } },
    why: 'Both carriers fell at both sites, yet nothing lands on them. A strong line sits between them and takes the tube’s limited output. Unlike overdrive, there is a distinct new signal. Capture it and report it to the satellite operator.',
  },
];

export const EVIDENCE = {
  line: 'Thin steady line on my carrier, at both sites', block: 'Raised block with width on my carrier, at both sites', moving: 'Line moving across the waterfall',
  opposite: 'Same signal stronger on the opposite polarization', floorUp: 'Beacon down, floor beside the carrier up', floorFlat: 'Beacon down, floor beside the carrier flat',
  beaconBlock: 'One site, beacon down, block with width', localLine: 'One site, beacon normal, new signal', shoulders: 'Shoulders beside the carriers, no new signal',
  between: 'Strong line between the carriers', clean: 'Only the two expected carriers',
};

// Varies each ticket so a memorized value cannot identify it.
export function ticketSet(c, rand = Math.random) {
  const jitter = (v, range) => v + Math.round((rand() * 2 - 1) * range * 2) / 2;
  const set = { ...c.set };
  if (set.rainDb) set.rainDb = jitter(set.rainDb, 1);
  if (set.mispointDb && !set.interferer) set.mispointDb = jitter(set.mispointDb, 1);
  if (set.interferer) set.interferer = { ...set.interferer, icDb: jitter(set.interferer.icDb, 1), offsetMHz: set.interferer.offsetMHz + (c.id === 'robbing' ? jitter(0, 1) : jitter(0, 0.5)) };
  return set;
}

export const ANSWERS = {
  rain: 'Rain fade at Site A', mispoint: 'Antenna mispointing at Site A', uplinkTone: 'CW tone on the uplink',
  uplinkBand: 'Modulated signal on the uplink', swept: 'Swept interference', downlink: 'Local interference at Site A',
  overdrive: 'Transponder overdrive', robbing: 'Power robbing by a strong signal', xpol: 'Cross-polarized carrier', asi: 'Adjacent-satellite interference', none: 'No RF fault',
};
