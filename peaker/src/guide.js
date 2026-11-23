// A first task that follows the field procedure and checks each step from the live readings.
export const GUIDE = [
  { title: 'Find the signal', text: 'Jog the antenna, or press Go to predicted, until the beacon rises out of the noise on the analyzer. This step completes at 6 dB C/N.' },
  { title: 'Confirm the main lobe', text: 'A side lobe also looks like a peak. Compare Beacon level with Expected on-axis. The main lobe reads within 8 dB of it. If you do not trust the expected level, scan across the peak: the main lobe is the strongest, with weaker, roughly matching lobes on both sides.' },
  { title: 'Peak it', text: 'Move in small steps on one axis at a time, or press Auto-peak. This step completes within 1 dB of the expected level.' },
  { title: 'Keep it peaked', text: 'Satellites drift, and inclined ones trace a daily figure-8. Start Step-track. Or, on an inclined satellite with Program track on, raise Simulation speed until the Fixed dish reading falls at least 1 dB behind your live level.' },
];

export const GUIDE_DONE = 'Done. In the field, your next step is to peak polarization by rotating the feed for the best cross-pol isolation. This lab does not model polarization skew.';

const CHECKS = [
  (r) => r.cnDb >= 6,
  (r) => !r.searching && r.levelDbm >= r.expectedDbm - 8,
  (r) => !r.searching && r.levelDbm >= r.expectedDbm - 1,
  // Program track alone proves nothing until the learner has seen what it prevents.
  (r) => r.levelDbm >= r.expectedDbm - 1 && (r.stepTracking || (r.tracking && r.fixedLossDb >= 1)),
];

// Progress only moves forward, so a noisy reading cannot undo a finished step.
export function guideProgress(done, readings) {
  while (done < CHECKS.length && CHECKS[done](readings)) done++;
  return done;
}

// Near the peak, reading against the predicted level is the practical test for which lobe you are on.
export function lobeCheck(levelDbm, expectedDbm, cnDb) {
  if (cnDb < 3) return 'no signal';
  const rel = levelDbm - expectedDbm;
  if (rel >= -3) return 'main lobe';
  if (rel >= -8) return 'main lobe, off peak';
  return 'side lobe or far off';
}

export function trackingAdvice(peakDeg, beamDeg) {
  // A dish is peaked at one moment, possibly at one end of the track, so the worst offset is the full peak-to-peak swing.
  const lossDb = 12 * ((2 * peakDeg) / beamDeg) ** 2;
  const why = `Gravity from the Sun and Moon slowly tilts a geostationary orbit. Station-keeping fuel corrects this, and an inclined satellite is one whose operator has stopped correcting it to extend its life. It then traces a narrow daily figure-8, mostly north and south. This one moves up to ${peakDeg.toFixed(2)}° from its average position, against a ${beamDeg.toFixed(2)}° beam.`;
  if (lossDb < 0.5) return `${why} Even peaked at one end of that swing, a fixed mount loses under 0.5 dB, so it does not need tracking.`;
  if (lossDb < 3) return `${why} A fixed mount peaked at one end of that swing would lose up to ${lossDb.toFixed(1)} dB at the other. Step-track or periodic repeaking is worthwhile if your margin is thin.`;
  return `${why} The satellite leaves the beam of a fixed mount during the day, so this antenna needs program track or step-track.`;
}
