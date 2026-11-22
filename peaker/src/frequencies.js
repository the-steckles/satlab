// Downlink ranges in MHz. `gen` is where an estimated beacon may be placed.
export const BANDS = {
  VHF: { min: 30, max: 300, gen: [137, 138] },
  UHF: { min: 300, max: 1000, gen: [435, 438] },
  L: { min: 1000, max: 2000, gen: [1525, 1559] },
  S: { min: 2000, max: 3000, gen: [2200, 2290] },
  C: { min: 3000, max: 7000, gen: [3700, 4200] },
  X: { min: 7000, max: 10000, gen: [7250, 7750] },
  Ku: { min: 10000, max: 15000, gen: [11700, 12200] },
  Ka: { min: 17000, max: 31000, gen: [19700, 20200] },
};

export const bandOf = (mhz) => Object.keys(BANDS).find((b) => mhz >= BANDS[b].min && mhz < BANDS[b].max) ?? null;

function hash(n) {
  let h = (n ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < 4; i++) h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

export function estimatedBeacon(norad, band) {
  const [lo, hi] = BANDS[band].gen;
  // Beacons usually sit near a band edge, on a 250 kHz grid.
  const steps = Math.max(1, Math.floor(((hi - lo) * 0.1) / 0.25));
  const offset = (hash(norad) % steps) * 0.25;
  const freqMHz = hash(norad + 1) % 2 ? lo + 0.25 + offset : hi - 0.25 - offset;
  return { freqMHz, pol: hash(norad + 2) % 2 ? 'H' : 'V', beam: '', label: 'Estimated beacon', source: 'Estimated', url: null };
}

const isBeaconLike = (t) => t.mode === 'CW' || /beacon/i.test(t.description ?? '');

export function resolveBeacons(norad, band, { plans = {}, transmitters = {} } = {}) {
  const plan = plans[norad];
  const listed = (plan?.beacons ?? []).filter((b) => bandOf(b.freqMHz) === band);
  if (listed.length) {
    return listed.map((b) => ({ ...b, label: `${b.freqMHz.toFixed(3)} MHz`, source: 'Frequency Plan Satellites', url: plan.url }));
  }
  const tx = (transmitters[norad] ?? []).filter((t) => bandOf(t.freqMHz) === band);
  if (tx.length) {
    const preferred = tx.filter(isBeaconLike);
    return (preferred.length ? preferred : tx).map((t) => ({
      freqMHz: t.freqMHz, pol: '', beam: '', label: t.description || `${t.freqMHz} MHz`, source: 'SatNOGS',
      url: `https://db.satnogs.org/satellite/${norad}`,
    }));
  }
  return [estimatedBeacon(norad, band)];
}

// Bands with real data come first, so a satellite opens on something genuine.
export function bandsFor(norad, { plans = {}, transmitters = {} } = {}) {
  const known = new Set([...(plans[norad]?.beacons ?? []), ...(transmitters[norad] ?? [])].map((b) => bandOf(b.freqMHz)).filter(Boolean));
  const names = Object.keys(BANDS);
  return { known: names.filter((b) => known.has(b)), other: names.filter((b) => !known.has(b)) };
}
