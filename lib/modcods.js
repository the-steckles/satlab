// DVB-S2 quasi-error-free Es/N0 thresholds in dB, ETSI EN 302 307-1.
export const MODCODS = {
  'QPSK 1/2': 1.0, 'QPSK 3/4': 4.03, '8PSK 2/3': 6.62, '8PSK 3/4': 7.91, '16APSK 3/4': 10.21, '32APSK 3/4': 12.73,
};

// Illustrative receiver acquisition times, shared so every lab recovers at the same pace.
export const RELOCK_STEPS = { searching: 0.8, frameSync: 0.5, carrierLock: 0.4, fecLock: 0.4 };
export const RELOCK_S = Object.values(RELOCK_STEPS).reduce((a, b) => a + b);

const BITS = { QPSK: 2, '8PSK': 3, '16APSK': 4, '32APSK': 5 };

// shortcut: ignores DVB-S2 framing and pilot overhead of a few percent, add it if exact capacity is ever taught.
export function throughputMbps(modcod, symbolRateMsps) {
  const [mod, rate] = modcod.split(' '), [n, d] = rate.split('/').map(Number);
  return BITS[mod] * (n / d) * symbolRateMsps;
}
