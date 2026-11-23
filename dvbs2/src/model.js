// Receiver-level model of two overlapping DVB-S2 signals on a fictional satellite. Symbols are random and
// the video is drawn locally. There is deliberately no bitstream, encoder, IQ export or transmit path.
import { constellation, gaussian, merDb } from '../../lib/constellation.js';
import { MODCODS, RELOCK_STEPS } from '../../lib/modcods.js';
import { DEMOD_ACQUIRE_DB, DEMOD_HOLD_DB, MARGINAL_DB, RECEIVER_NAMES } from '../../lib/receiver.js';
import { twtaOutput } from '../../lib/twta.js';

export { DEMOD_ACQUIRE_DB, DEMOD_HOLD_DB, MODCODS };
export const DEFAULTS = { cnDb: 16, modcod: '8PSK 2/3', overlayOn: true, ratioDb: -25, authOn: false };
export const STATES = {
  locked: RECEIVER_NAMES.locked, degraded: RECEIVER_NAMES.marginal, fecFail: RECEIVER_NAMES.fecFail, lost: RECEIVER_NAMES.lost, searching: 'Searching',
  frameSync: 'Frame sync', carrierLock: 'Carrier lock', fecLock: 'FEC lock',
};

const SECONDS = { lost: 0.7, ...RELOCK_STEPS };
export const NORMAL_MER_DB = DEFAULTS.cnDb; // A fixed commissioning baseline, so a fade cannot lower its own reference.
const MER_ALARM_DB = 3; // Illustrative: operators alarm on a sustained drop from the carrier's normal MER.
const TRACKING = new Set(['carrierLock', 'fecLock', 'locked', 'degraded', 'fecFail']);
const DECODING = new Set(['fecLock', 'locked', 'degraded']);
const lin = (db) => 10 ** (db / 10);
const dB = (x) => 10 * Math.log10(x);

const NOMINAL_DRIVE = lin(-6); // The transponder's normal input backoff, matching Interference Lab.

// Es/(N+I) of each signal, treating the other as noise. Both pass through one TWTA, so a strong input
// lowers the gain for everything while the downlink noise at the receiver stays put.
export function levels(p) {
  const n = lin(-p.cnDb), o = p.overlayOn ? lin(p.ratioDb) : 0, drive = NOMINAL_DRIVE * (1 + o);
  const g = (twtaOutput(drive) / drive) / (twtaOutput(NOMINAL_DRIVE) / NOMINAL_DRIVE);
  return {
    n, o, g, need: MODCODS[p.modcod], carrierEs: dB(g / (n + g * o)), overlayEs: o > 0 ? dB((g * o) / (n + g)) : -Infinity,
    totalDb: dB(twtaOutput(drive) / twtaOutput(NOMINAL_DRIVE)), carrierDb: dB(g),
  };
}

export const createReceiver = () => ({ state: 'locked', source: 'carrier', timer: 0 });

export function stepReceiver(rx, p, dt) {
  const l = levels(p), es = (source) => (source === 'overlay' ? l.overlayEs : l.carrierEs);
  const timer = rx.timer + dt, to = (state, source = rx.source) => ({ state, source, timer: 0 });
  const signal = rx.source ? es(rx.source) : -Infinity, margin = signal - l.need;
  switch (rx.state) {
    case 'locked':
    case 'degraded':
      if (margin < 0) return to('fecFail');
      return { ...rx, state: margin < MARGINAL_DB ? 'degraded' : 'locked', timer };
    case 'fecFail':
      if (signal < DEMOD_HOLD_DB) return to('lost');
      if (margin >= 0) return to('degraded');
      // Stuck on an undecodable signal while the other one could decode, so search again.
      if (rx.source && es(rx.source === 'overlay' ? 'carrier' : 'overlay') >= Math.max(signal, l.need)) return to('searching', null);
      return { ...rx, timer };
    case 'lost':
      if (signal >= DEMOD_ACQUIRE_DB) return to('fecFail');
      return timer >= SECONDS.lost ? to('searching', null) : { ...rx, timer };
    case 'searching': {
      if (timer < SECONDS.searching) return { ...rx, timer };
      const best = l.overlayEs > l.carrierEs ? 'overlay' : 'carrier';
      return es(best) >= DEMOD_ACQUIRE_DB ? to('frameSync', best) : { ...rx, timer: 0 };
    }
    case 'fecLock':
      if (margin < 0) return to('fecFail');
      return timer < SECONDS.fecLock ? { ...rx, timer } : to('locked');
    default: // frameSync and carrierLock depend only on the PLHEADER, so a payload FEC cannot block them.
      if (signal < DEMOD_HOLD_DB) return to('searching', null);
      if (timer < SECONDS[rx.state]) return { ...rx, timer };
      if (rx.state === 'frameSync') return to('carrierLock');
      return to(margin >= 0 ? 'fecLock' : 'fecFail');
  }
}

// Replays the overlay rising to a peak and returning, so a lesson can jump to a level with the correct lock history.
export function settle(p, peakDb = p.ratioDb) {
  let rx = createReceiver();
  for (let ratioDb = -30; ratioDb < peakDb; ratioDb += 0.5) rx = stepReceiver(rx, { ...p, ratioDb }, 0.5);
  for (let i = 0; i < 16; i++) rx = stepReceiver(rx, { ...p, ratioDb: peakDb }, 0.5);
  for (let i = 0; i < 16; i++) rx = stepReceiver(rx, p, 0.5);
  return rx;
}

export const isDecoding = (rx) => DECODING.has(rx.state);

// What the screen shows for this receiver state.
export function videoState(rx, p) {
  const l = levels(p);
  if (rx.state !== 'locked' && rx.state !== 'degraded') return { mode: rx.state === 'lost' || rx.state === 'fecFail' ? 'frozen' : 'none', errors: 1 };
  if (rx.source === 'overlay' && p.authOn) return { mode: 'blocked', errors: 0 };
  const margin = (rx.source === 'overlay' ? l.overlayEs : l.carrierEs) - l.need;
  // LDPC and BCH are nearly error-free above threshold and collapse within a few tenths of a dB.
  return { mode: rx.source, errors: margin >= 0.2 ? 0 : Math.min(0.6, 0.1 + (0.2 - margin) * 2) };
}

// Received symbols relative to whichever signal the demodulator is following.
export function iqSamples(p, rx, count = 1100, rand = Math.random) {
  const l = levels(p), ideal = constellation(p.modcod);
  const ref = rx.source ?? (l.o > 1 ? 'overlay' : 'carrier'), refPower = ref === 'overlay' ? l.o : 1, otherPower = ref === 'overlay' ? 1 : l.o;
  const other = Math.sqrt(otherPower / refPower), sigma = Math.sqrt(l.n / (l.g * refPower) / 2), tracking = TRACKING.has(rx.state);
  const samples = [];
  for (let n = 0; n < count; n++) {
    const s = ideal[Math.floor(rand() * ideal.length)], x = ideal[Math.floor(rand() * ideal.length)], phase = 2 * Math.PI * rand();
    let i = s.i + other * (x.i * Math.cos(phase) - x.q * Math.sin(phase)) + sigma * gaussian(rand);
    let q = s.q + other * (x.i * Math.sin(phase) + x.q * Math.cos(phase)) + sigma * gaussian(rand);
    // Without carrier recovery the constellation has no fixed rotation, so it smears into rings.
    if (!tracking) {
      const spin = 2 * Math.PI * rand(), c = Math.cos(spin), d = Math.sin(spin);
      [i, q] = [i * c - q * d, i * d + q * c];
    }
    samples.push({ i, q });
  }
  return { samples, ideal, tracking, merDb: tracking ? merDb(samples, ideal) : null };
}

// What a monitoring position can know. The true source stays out of this, because it is simulator knowledge.
export function monitor(p, rx, measuredMer = null, baselineDb = NORMAL_MER_DB) {
  const l = levels(p), onOverlay = rx.source === 'overlay', decoding = isDecoding(rx);
  const margin = rx.source ? (onOverlay ? l.overlayEs : l.carrierEs) - l.need : -Infinity;
  return {
    levelRiseDb: l.totalDb,
    carrierChangeDb: l.carrierDb,
    levelAlarm: l.totalDb >= 1,
    // These fields live inside the decoded stream, so nothing is known about them until FEC locks.
    serviceId: !decoding ? 'waiting for FEC' : onOverlay ? 'UNEXPECTED' : 'SATLAB-1 / CH 1',
    idAlarm: decoding && onOverlay,
    authResult: !p.authOn ? 'off' : !decoding ? 'waiting' : onOverlay ? 'FAILED' : 'verified',
    serviceAlarm: !decoding,
    lowMargin: decoding && margin < MARGINAL_DB,
    merAlarm: measuredMer !== null && measuredMer < baselineDb - MER_ALARM_DB,
  };
}
