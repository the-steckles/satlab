// Receiver-level model of two overlapping DVB-S2 signals on a fictional satellite. Symbols are random and
// the video is drawn locally. There is deliberately no bitstream, encoder, IQ export or transmit path.
import { constellation, gaussian, merDb } from '../../lib/constellation.js';

// Quasi-error-free Es/N0 thresholds, ETSI EN 302 307-1.
export const MODCODS = { 'QPSK 1/2': 1.0, 'QPSK 3/4': 4.03, '8PSK 2/3': 6.62, '16APSK 3/4': 10.21 };
export const DEFAULTS = { cnDb: 16, modcod: '8PSK 2/3', overlayOn: true, ratioDb: -25, authOn: false };
export const STATES = {
  locked: 'Locked', degraded: 'Degraded', fecFail: 'Demod locked, FEC failing', lost: 'Signal lost', searching: 'Searching',
  frameSync: 'Frame sync', carrierLock: 'Carrier lock', fecLock: 'FEC lock',
};

const SECONDS = { lost: 0.7, searching: 0.8, frameSync: 0.5, carrierLock: 0.4, fecLock: 0.4 };
const ACQUIRE_DB = 1.5; // Illustrative: a receiver needs a little more signal to acquire than to hold lock.
const DEMOD_BELOW_DB = 3; // Illustrative: carrier and frame tracking outlast the FEC by a few dB.
const TRACKING = new Set(['carrierLock', 'fecLock', 'locked', 'degraded', 'fecFail']);
const DECODING = new Set(['fecLock', 'locked', 'degraded']);
const lin = (db) => 10 ** (db / 10);
const dB = (x) => 10 * Math.log10(x);

// Es/N0 of each signal, treating the other one as noise. Carrier power is the reference.
export function levels(p) {
  const n = lin(-p.cnDb), o = p.overlayOn ? lin(p.ratioDb) : 0;
  return { n, o, need: MODCODS[p.modcod], carrierEs: dB(1 / (n + o)), overlayEs: o > 0 ? dB(o / (n + 1)) : -Infinity, totalDb: dB(1 + o) };
}

export const createReceiver = () => ({ state: 'locked', source: 'carrier', timer: 0 });

export function stepReceiver(rx, p, dt) {
  const l = levels(p), es = (source) => (source === 'overlay' ? l.overlayEs : l.carrierEs);
  const timer = rx.timer + dt, to = (state, source = rx.source) => ({ state, source, timer: 0 });
  const margin = rx.source ? es(rx.source) - l.need : -Infinity;
  switch (rx.state) {
    case 'locked':
    case 'degraded': {
      if (margin < 0) return to('fecFail');
      return { ...rx, state: margin < 1 ? 'degraded' : 'locked', timer };
    }
    case 'fecFail':
      if (margin >= 0) return to('degraded');
      return margin < -DEMOD_BELOW_DB ? to('lost') : { ...rx, timer };
    case 'lost':
      if (margin >= 0) return to('degraded');
      return timer >= SECONDS.lost ? to('searching', null) : { ...rx, timer };
    case 'searching': {
      if (timer < SECONDS.searching) return { ...rx, timer };
      const best = l.overlayEs > l.carrierEs ? 'overlay' : 'carrier';
      return es(best) >= l.need + ACQUIRE_DB ? to('frameSync', best) : { ...rx, timer: 0 };
    }
    default: {
      if (margin < 0) return to('searching', null);
      if (timer < SECONDS[rx.state]) return { ...rx, timer };
      return to({ frameSync: 'carrierLock', carrierLock: 'fecLock', fecLock: 'locked' }[rx.state]);
    }
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
  const other = Math.sqrt(otherPower / refPower), sigma = Math.sqrt(l.n / refPower / 2), tracking = TRACKING.has(rx.state);
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
    samples.push({ i, q, refI: s.i, refQ: s.q });
  }
  return { samples, ideal, tracking, merDb: tracking ? merDb(samples) : null };
}

// What a monitoring position would flag.
export function monitor(p, rx) {
  const l = levels(p), onOverlay = rx.source === 'overlay', decoding = DECODING.has(rx.state);
  const margin = rx.source ? (onOverlay ? l.overlayEs : l.carrierEs) - l.need : -Infinity;
  return {
    levelRiseDb: l.totalDb,
    levelAlarm: l.totalDb >= 1,
    // These fields live inside the decoded stream, so nothing is known about them until FEC locks.
    serviceId: !decoding ? 'waiting for FEC' : onOverlay ? 'UNEXPECTED' : 'SATLAB-1 / CH 1',
    idAlarm: decoding && onOverlay,
    authResult: !p.authOn ? 'off' : !decoding ? 'waiting' : onOverlay ? 'FAILED' : 'verified',
    serviceAlarm: !decoding,
    lowMargin: decoding && margin < 1,
  };
}
