// End-to-end budget for one carrier on the fictional SatLab-1. Powers in dBW, values typical rather than measured.
import { MODCODS, throughputMbps } from '../../lib/modcods.js';
import { carrierToImDb, twtaOutput } from '../../lib/twta.js';
import { beamwidthDeg, gainDbi, peakGainDbi } from '../../peaker/src/antenna.js';
import { atmosphericLossDb, fsplDb } from '../../peaker/src/link.js';

const BOLTZMANN_DBW = -228.6, EARTH_KM = 6378, GEO_ALT_KM = 35786, RAIN_TEMP_K = 275;
const MODEM_MER_LIMIT_DB = 28; // A real modem's own noise caps measured MER however clean the link is.
const OCCUPIED_FACTOR = 1.2; // DVB-S2 with 20% roll-off.

export const DEFAULTS = {
  txPowerW: 20, txDishM: 3.8, txLossDb: 1, txPointDeg: 0, txElDeg: 35, upRainDb: 0, upMHz: 14250,
  satGtDb: 3, sfdDbWm2: -88, satEirpDbw: 50, otherCarriers: 1, downMHz: 12500,
  rxDishM: 1.2, rxTempK: 110, rxPointDeg: 0, rxElDeg: 35, downRainDb: 0,
  rsMsps: 5, modcod: '16APSK 3/4',
};

const lin = (db) => 10 ** (db / 10);
const dB = (x) => 10 * Math.log10(x);
export const sumInverseDb = (...values) => -dB(values.reduce((sum, v) => sum + (Number.isFinite(v) ? lin(-v) : 0), 0));

export function slantRangeKm(elDeg) {
  const s = Math.sin((elDeg * Math.PI) / 180);
  return Math.sqrt((EARTH_KM * s) ** 2 + 2 * EARTH_KM * GEO_ALT_KM + GEO_ALT_KM ** 2) - EARTH_KM * s;
}

// Uses Peaker's full antenna pattern, so large errors reach side lobes and the scatter floor instead of a runaway parabola.
export const pointingLossDb = (offDeg, dishM, hz) => gainDbi(0, dishM, hz) - gainDbi(offDeg, dishM, hz);

// shortcut: typical single-carrier distortion by modulation, improving 2 dB per dB of backoff. Replace with measured curves or predistortion data if available.
const CARRIER_CD_DB = { QPSK: 20, '8PSK': 16, '16APSK': 13, '32APSK': 10 };
const carrierDistortionDb = (modcod, drive) => Math.max(3, CARRIER_CD_DB[modcod.split(' ')[0]] - 20 * Math.log10(drive));

// The flux one carrier delivers with the given transmit settings.
function carrierFlux(p) {
  const hz = p.upMHz * 1e6, range = slantRangeKm(p.txElDeg);
  return dB(p.txPowerW) - p.txLossDb + peakGainDbi(p.txDishM, hz) - pointingLossDb(p.txPointDeg, p.txDishM, hz) - dB(4 * Math.PI * (range * 1000) ** 2) - atmosphericLossDb(p.upMHz, p.txElDeg) - p.upRainDb;
}

export function budget(params) {
  const p = { ...DEFAULTS, ...params };
  const upHz = p.upMHz * 1e6, downHz = p.downMHz * 1e6, rsHz = p.rsMsps * 1e6;

  const txPowerDbw = dB(p.txPowerW), txGainDbi = peakGainDbi(p.txDishM, upHz), txBeamDeg = beamwidthDeg(p.txDishM, upHz);
  const txPointLossDb = pointingLossDb(p.txPointDeg, p.txDishM, upHz);
  const eirpUpDbw = txPowerDbw - p.txLossDb + txGainDbi - txPointLossDb;
  const upRangeKm = slantRangeKm(p.txElDeg), upPathDb = fsplDb(upRangeKm, p.upMHz);
  const upAtmDb = atmosphericLossDb(p.upMHz, p.txElDeg);
  const spreadDb = dB(4 * Math.PI * (upRangeKm * 1000) ** 2);
  const fluxDbWm2 = eirpUpDbw - spreadDb - upAtmDb - p.upRainDb;
  // Neighbors come from other sites, so your power, dish and rain do not move them.
  const neighborFluxDbWm2 = carrierFlux({ ...DEFAULTS, upMHz: p.upMHz });
  const totalFlux = lin(fluxDbWm2) + p.otherCarriers * lin(neighborFluxDbWm2);
  const shareDb = dB(totalFlux / lin(fluxDbWm2));
  const iboDb = p.sfdDbWm2 - dB(totalFlux);
  const drive = lin(-iboDb), oboDb = -dB(twtaOutput(drive));
  const cn0UpDbHz = eirpUpDbw - upPathDb - upAtmDb - p.upRainDb + p.satGtDb - BOLTZMANN_DBW;

  const eirpDownDbw = p.satEirpDbw - oboDb - shareDb;
  const neighborEirpDbw = p.otherCarriers > 0 ? p.satEirpDbw - oboDb + neighborFluxDbWm2 - dB(totalFlux) : null;
  const downRangeKm = slantRangeKm(p.rxElDeg), downPathDb = fsplDb(downRangeKm, p.downMHz);
  const downAtmDb = atmosphericLossDb(p.downMHz, p.rxElDeg);
  const rxGainDbi = peakGainDbi(p.rxDishM, downHz), rxBeamDeg = beamwidthDeg(p.rxDishM, downHz);
  const rxPointLossDb = pointingLossDb(p.rxPointDeg, p.rxDishM, downHz);
  const tsysK = p.rxTempK + RAIN_TEMP_K * (1 - lin(-p.downRainDb)); // Wet air radiates noise as well as absorbing signal.
  const gtDbK = rxGainDbi - dB(tsysK);
  const rxCarrierDbw = eirpDownDbw - downPathDb - downAtmDb - p.downRainDb + rxGainDbi - rxPointLossDb;
  const cn0DownDbHz = eirpDownDbw - downPathDb - downAtmDb - p.downRainDb - rxPointLossDb + gtDbK - BOLTZMANN_DBW;

  // A lone carrier has no in-band third-order products from a second carrier.
  // Products come from every carrier, so a carrier below the average share sits closer to them.
  const cimDb = p.otherCarriers > 0 ? carrierToImDb(drive) + dB(1 + p.otherCarriers) - shareDb : Infinity;
  const cim0DbHz = cimDb + dB(rsHz);
  // A nonlinear tube warps every carrier's constellation at the total drive, and denser ones suffer most.
  const distortionDb = carrierDistortionDb(p.modcod, drive);
  const distortion0DbHz = distortionDb + dB(rsHz);
  const cn0DbHz = sumInverseDb(cn0UpDbHz, cn0DownDbHz, cim0DbHz, distortion0DbHz);
  const esN0Db = cn0DbHz - dB(rsHz);
  const cnOccupiedDb = cn0DbHz - dB(rsHz * OCCUPIED_FACTOR);
  const mbps = throughputMbps(p.modcod, p.rsMsps), bitsPerSymbol = mbps / p.rsMsps;
  const ebN0Db = esN0Db - dB(bitsPerSymbol);
  const merDb = sumInverseDb(esN0Db, MODEM_MER_LIMIT_DB);
  // A marker from carrier top to floor reads (C+N)/N. It sees noise and IM on the floor, but not a warped constellation.
  const analyzerCnDb = sumInverseDb(cn0UpDbHz, cn0DownDbHz, cim0DbHz) - dB(rsHz), analyzerDeltaDb = dB(1 + lin(analyzerCnDb));
  const needDb = MODCODS[p.modcod], marginDb = esN0Db - needDb;
  const noiseInRsDbw = BOLTZMANN_DBW + dB(tsysK) + dB(rsHz);

  const limits = [['Uplink', cn0UpDbHz], ['Downlink', cn0DownDbHz], ['Intermodulation', cim0DbHz], ['Nonlinear distortion', distortion0DbHz]];
  const limitedBy = limits.reduce((a, b) => (b[1] < a[1] ? b : a))[0];

  return {
    p, txPowerDbw, txGainDbi, txBeamDeg, txPointLossDb, eirpUpDbw, upRangeKm, upPathDb, upAtmDb, spreadDb, fluxDbWm2, shareDb, iboDb, oboDb,
    cn0UpDbHz, eirpDownDbw, downRangeKm, downPathDb, downAtmDb, rxGainDbi, rxBeamDeg, rxPointLossDb, tsysK, gtDbK, rxCarrierDbw, cn0DownDbHz,
    cimDb, cim0DbHz, distortionDb, distortion0DbHz, neighborEirpDbw, neighborFluxDbWm2, analyzerCnDb, analyzerDeltaDb, overdriven: iboDb < 0, cn0DbHz, esN0Db, cnOccupiedDb, ebN0Db, merDb, needDb, marginDb, mbps, noiseInRsDbw, limitedBy,
  };
}

// Most throughput this link can carry while keeping `reserveDb` of margin.
export function bestModcod(params, reserveDb = 1) {
  const b = budget(params);
  // Lone-carrier distortion depends on the modulation, so each candidate needs its own budget.
  const usable = Object.keys(MODCODS).filter((name) => budget({ ...params, modcod: name }).marginDb >= reserveDb);
  if (!usable.length) return null;
  return usable.reduce((a, c) => (throughputMbps(c, b.p.rsMsps) > throughputMbps(a, b.p.rsMsps) ? c : a));
}

// Largest value of one impairment that still closes the link, by bisection.
function toleranceOf(params, key, top) {
  if (budget(params).marginDb < 0) return 0;
  if (budget({ ...params, [key]: top }).marginDb >= 0) return top;
  let lo = 0, hi = top;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (budget({ ...params, [key]: mid }).marginDb >= 0) lo = mid; else hi = mid;
  }
  return lo;
}
// Measured from clear sky, so the answer does not depend on the rain currently set.
export const rainMarginDb = (params) => toleranceOf({ ...params, downRainDb: 0 }, 'downRainDb', 30);
export function pointingToleranceDeg(params) {
  const b = budget(params);
  let lo = 0, hi = b.rxBeamDeg;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pointingLossDb(mid, b.p.rxDishM, b.p.downMHz * 1e6) < 1) lo = mid; else hi = mid;
  }
  const closesDeg = toleranceOf({ ...params, rxPointDeg: 0 }, 'rxPointDeg', b.rxBeamDeg);
  return { closesDeg, closesPastBeam: closesDeg >= b.rxBeamDeg, oneDbDeg: lo };
}

// Each term of the budget as uplink power changes, which is how an operator picks a backoff.
export const BACKOFF_MIN_DB = -8, BACKOFF_MAX_DB = 22;
export function backoffCurve(params, points = 61) {
  const base = budget(params), rows = [], neighbors = base.p.otherCarriers * lin(base.neighborFluxDbWm2);
  for (let i = 0; i < points; i++) {
    const iboDb = BACKOFF_MIN_DB + ((BACKOFF_MAX_DB - BACKOFF_MIN_DB) * i) / (points - 1);
    // Only your carrier moves, so backoffs the neighbors alone already exceed cannot be reached.
    const yours = lin(base.p.sfdDbWm2 - iboDb) - neighbors;
    if (yours <= 0) continue;
    const b = budget({ ...base.p, txPowerW: base.p.txPowerW * (yours / lin(base.fluxDbWm2)) });
    rows.push({ iboDb, oboDb: b.oboDb, up: b.cn0UpDbHz - dB(base.p.rsMsps * 1e6), down: b.cn0DownDbHz - dB(base.p.rsMsps * 1e6), im: Math.min(b.cimDb, b.distortionDb), esN0: b.esN0Db });
  }
  // Neighbors alone can overdrive a low-SFD transponder past this plot, leaving no reachable point.
  if (!rows.length) return { rows, best: null, bestAtEdge: true, operatingIbo: base.iboDb };
  const best = rows.reduce((a, c) => (c.esN0 > a.esN0 ? c : a));
  return { rows, best, bestAtEdge: best === rows[0] || best === rows.at(-1), operatingIbo: base.iboDb };
}
