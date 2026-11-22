// Link budget and simulated analyzer trace. Powers in dBm unless named otherwise.
const C_M_S = 299792458;
const BOLTZMANN_DBW = -228.6;

export const fsplDb = (rangeKm, freqMHz) => 32.45 + 20 * Math.log10(freqMHz) + 20 * Math.log10(rangeKm);

// shortcut: clear-sky zenith loss by frequency, replace with ITU-R P.676 if weather is ever modeled.
export function atmosphericLossDb(freqMHz, elDeg) {
  const zenith = freqMHz < 10000 ? 0.05 : freqMHz < 15000 ? 0.12 : 0.4;
  return zenith / Math.sin((Math.max(elDeg, 3) * Math.PI) / 180);
}

export function systemTempK(freqMHz) {
  if (freqMHz < 1000) return 400;
  if (freqMHz < 3000) return 120;
  if (freqMHz < 8000) return 75;
  return freqMHz < 15000 ? 110 : 180;
}

export const noiseDbm = (tempK, bandwidthHz) => BOLTZMANN_DBW + 10 * Math.log10(tempK * bandwidthHz) + 30;
export const dopplerHz = (freqHz, rangeRateKmS) => (-freqHz * rangeRateKmS * 1000) / C_M_S;
// Operators do not publish these levels, so they are typical values.
export const beaconEirpDbw = (isGeo) => (isGeo ? 14 : 0);
export const TRANSPONDER_EIRP_DBW = 48;

export function receivedDbm({ eirpDbw, rangeKm, freqMHz, elDeg, gainDbi }) {
  return eirpDbw + 30 - fsplDb(rangeKm, freqMHz) - atmosphericLossDb(freqMHz, elDeg) + gainDbi;
}

// Single-sideband phase noise of the beacon and receive chain, dBc/Hz.
function phaseNoiseDbcHz(offsetHz) {
  return Math.max(-130, -70 - 20 * Math.log10(Math.max(offsetHz, 100) / 1000));
}

// carriers: [{ freqHz, dbm }], blocks: [{ lowHz, highHz, dbmPerHz }]
export function computeTrace({ centerHz, spanHz, rbwHz, bins, noiseFloorDbm, carriers = [], blocks = [], rng = Math.random }) {
  const trace = new Float32Array(bins);
  const noise = 10 ** (noiseFloorDbm / 10);
  const sigma = rbwHz / 2.355;
  const start = centerHz - spanHz / 2;
  const df = spanHz / (bins - 1);
  const rolloff = rbwHz / 2 + df;

  for (let i = 0; i < bins; i++) {
    const f = start + i * df;
    let noiseLike = noise;
    for (const b of blocks) {
      if (f < b.lowHz - 4 * rolloff || f > b.highHz + 4 * rolloff) continue;
      const edge = 0.5 * (Math.tanh((f - b.lowHz) / rolloff) - Math.tanh((f - b.highHz) / rolloff));
      noiseLike += 10 ** ((b.dbmPerHz + 10 * Math.log10(rbwHz)) / 10) * edge;
    }
    let cw = 0;
    for (const c of carriers) {
      const d = Math.abs(f - c.freqHz);
      const p = 10 ** (c.dbm / 10);
      cw += p * Math.exp(-0.5 * (d / sigma) ** 2);
      if (d > rbwHz) cw += p * 10 ** ((phaseNoiseDbcHz(d) + 10 * Math.log10(rbwHz)) / 10);
    }
    // Averaged noise power in a bin is exponentially distributed.
    trace[i] = 10 * Math.log10(noiseLike * -Math.log(1 - rng()) + cw);
  }
  return trace;
}

export function peakNear(trace, centerHz, spanHz, targetHz, windowHz) {
  const start = centerHz - spanHz / 2;
  const df = spanHz / (trace.length - 1);
  const a = Math.max(0, Math.floor((targetHz - windowHz - start) / df));
  const b = Math.min(trace.length - 1, Math.ceil((targetHz + windowHz - start) / df));
  let best = { dbm: -Infinity, freqHz: targetHz };
  for (let i = a; i <= b; i++) if (trace[i] > best.dbm) best = { dbm: trace[i], freqHz: start + i * df };
  return best;
}
