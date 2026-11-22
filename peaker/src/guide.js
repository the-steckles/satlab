// A first task that follows the field procedure and checks each step from the live readings.
export const GUIDE = [
  { title: 'Find the signal', text: 'Jog the antenna, or press Go to predicted, until the beacon rises out of the noise on the analyzer. This step completes at 6 dB C/N.' },
  { title: 'Confirm the main lobe', text: 'A side lobe also looks like a peak. Compare Beacon level with Expected on-axis. The main lobe reads within 6 dB of it.' },
  { title: 'Peak it', text: 'Move in small steps on one axis at a time, or press Auto-peak. This step completes within 1 dB of the expected level.' },
  { title: 'Keep it peaked', text: 'Satellites drift, and inclined ones trace a daily figure-8. Turn on Program track or start Step-track. On an inclined satellite, raise Simulation speed to see what a fixed dish would lose.' },
];

export const GUIDE_DONE = 'Done. In the field, your next step is to peak polarization by rotating the feed for the best cross-pol isolation. This lab does not model polarization skew.';

const CHECKS = [
  (r) => r.cnDb >= 6,
  (r) => r.levelDbm >= r.expectedDbm - 6,
  (r) => r.levelDbm >= r.expectedDbm - 1,
  (r) => r.tracking,
];

// Progress only moves forward, so a noisy reading cannot undo a finished step.
export function guideProgress(done, readings) {
  while (done < CHECKS.length && CHECKS[done](readings)) done++;
  return done;
}
