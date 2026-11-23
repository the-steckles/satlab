// One receiver rule for every lab. Frame sync uses the PLHEADER, which is sent in robust pi/2 BPSK whatever the
// payload MODCOD, so the demodulator can hold well below the FEC threshold.
// shortcut: illustrative thresholds, because real demods differ. Replace them if a lab ever models a specific modem.
export const DEMOD_HOLD_DB = -3;
export const DEMOD_ACQUIRE_DB = -1.5;
export const MARGINAL_DB = 1;

export const RECEIVER_NAMES = { locked: 'Locked', marginal: 'Marginal', fecFail: 'Demod locked, FEC failing', lost: 'Lost' };

// The settled state for a steady signal. LDPC and BCH decode each frame on its own, so FEC has no memory.
// Hysteresis belongs to demod tracking, which DVB-S2 Lab adds on top of these limits.
export function receiverState(esDb, needDb) {
  if (esDb < DEMOD_HOLD_DB) return 'lost';
  if (esDb < needDb) return 'fecFail';
  return esDb < needDb + MARGINAL_DB ? 'marginal' : 'locked';
}
