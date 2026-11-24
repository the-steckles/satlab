// A simplified receive modem and practice tickets. Frequencies are L-band MHz unless named otherwise.
// Acquisition limits are illustrative, because they differ between modem models.
import { MODCODS, throughputMbps } from '../../lib/modcods.js';
import { MARGINAL_DB, receiverState } from '../../lib/receiver.js';

export const MIN_LEVEL_DBM = -75, ANALYZER_RBW_MHZ = 0.1;
const SITE_FLOOR_DBM = -79; // The receive noise floor in the analyzer's RBW, set by the site and not by the carrier.
const SYMBOL_RATE_TOLERANCE = 0.01;

// A modem searches around where it is tuned, by an amount set by the symbol rate it was told to expect.
export const captureRangeMHz = (rsMsps) => 0.25 * rsMsps;
export const lBandMHz = (rfMHz, loMHz) => Math.abs(rfMHz - loMHz);
export const isInverted = (rfMHz, loMHz) => loMHz > rfMHz;

export const CHECKS = [
  ['power', 'LNB power and signal level', 'Is the LNB powered, and is the input above the modem’s minimum level?'],
  ['frequency', 'Frequency', 'Does L-band equal the difference between the RF and the LNB LO? Is the carrier inside the shaded search band?'],
  ['symbolRate', 'Symbol rate', 'Does the configured rate match the carrier? Its −3 dB width is about the symbol rate at any roll-off. Confirm the value against the carrier plan.'],
  ['inversion', 'Spectral sense', 'Is the LNB LO above the RF? If so, the spectrum is inverted.'],
  ['quality', 'Demod and FEC', 'Once the demodulator locks, is Es/N0 above the threshold for the MODCOD it detected?'],
];

export const STATE_NAMES = {
  noSignal: 'No signal', searching: 'Searching', fecFail: 'Demod locked, FEC failing', locked: 'Locked',
};

export function modemState(cfg, sig) {
  const level = cfg.lnbPower ? sig.levelDbm : -Infinity;
  if (level < MIN_LEVEL_DBM) return { state: 'noSignal', failing: 'power' };
  // The drawn search band and this test use the same configured symbol rate.
  if (Math.abs(cfg.freqMHz - sig.freqMHz) > captureRangeMHz(cfg.rsMsps)) return { state: 'searching', failing: 'frequency' };
  if (Math.abs(cfg.rsMsps - sig.rsMsps) / sig.rsMsps > SYMBOL_RATE_TOLERANCE) return { state: 'searching', failing: 'symbolRate' };
  if (cfg.inverted !== isInverted(sig.rfMHz, sig.loMHz)) return { state: 'searching', failing: 'inversion' };
  const need = MODCODS[cfg.modcod], margin = sig.esN0Db - need, rx = receiverState(sig.esN0Db, need);
  if (rx === 'lost') return { state: 'searching', failing: 'quality', margin };
  if (rx === 'fecFail') return { state: 'fecFail', failing: 'quality', margin };
  return { state: 'locked', failing: null, margin };
}

// The fastest MODCOD this signal can carry while keeping the marginal reserve.
export function bestModcod(esN0Db, rsMsps) {
  const usable = Object.entries(MODCODS).filter(([, need]) => esN0Db >= need + MARGINAL_DB).map(([name]) => name);
  return usable.reduce((a, c) => (a === null || throughputMbps(c, rsMsps) > throughputMbps(a, rsMsps) ? c : a), null);
}

// Analyzer trace levels in dBm per RBW. The floor belongs to the site, and the carrier sits Es/N0 above it.
export function analyzerLevels(sig) {
  const floorDbm = sig.floorDbm ?? SITE_FLOOR_DBM, peakDbm = floorDbm + sig.esN0Db;
  return { peakDbm, floorDbm, totalDbm: peakDbm + 10 * Math.log10(sig.rsMsps / ANALYZER_RBW_MHZ) };
}

const carrier = (over) => {
  const sig = { rfMHz: 12500, loMHz: 10750, freqMHz: 1750, rsMsps: 5, esN0Db: 14, ...over };
  return { ...sig, levelDbm: analyzerLevels(sig).totalDbm };
};
const config = (over) => ({ lnbPower: true, freqMHz: 1750, rsMsps: 5, inverted: false, modcod: '8PSK 2/3', ...over });

export const TICKETS = [
  {
    title: 'New site, nothing on the modem', show: ['modemState', 'spectrum'],
    story: 'An installer finished a new site and reports that the dish is peaked. The modem has never locked.',
    signal: carrier(), start: config({ lnbPower: false, freqMHz: 1751 }),
    fixed: 'The LNB draws its power up the coax from the modem. With DC off, nothing arrives, so nothing else can be judged yet. Check LNB power first, because it is quick and common.',
  },
  {
    title: 'Carrier is on the analyzer, modem is searching', show: ['sRf', 'spectrum', 'modemState'],
    story: 'The work order gives the carrier’s RF frequency. The modem was set up from a template used at another site.',
    signal: carrier(), start: config({ freqMHz: 1250 }),
    fixed: 'L-band is RF minus LO: 12500 − 10750 = 1750 MHz. A value copied from another site’s LO is one of the most common reasons a carrier will not lock.',
  },
  {
    title: 'It worked until the LNB was replaced', show: ['spectrum', 'modemState'],
    story: 'A narrow carrier locked for months, then dropped the day a technician swapped the LNB.',
    signal: carrier({ freqMHz: 1751.5, rsMsps: 2 }), start: config({ rsMsps: 2 }),
    fixed: 'An LNB’s LO can be off by a megahertz or more, and a narrow carrier has a narrow search range. Retune to the true center on the analyzer, then watch it for a while. A drifting LO needs a better LNB or a locked reference.',
  },
  {
    title: 'Right frequency, still searching', show: ['freqMHz', 'rsMsps', 'spectrum'],
    story: 'The modem matches the work order, and the carrier sits inside the search band.',
    signal: carrier({ rsMsps: 7.5 }), start: config(),
    fixed: 'The −3 dB width equals the symbol rate at any roll-off, here about 7.5 MHz. Occupied width depends on roll-off, so it is a weaker estimate. Confirm the value with whoever transmits the carrier.',
  },
  {
    title: 'A C-band site that will not lock', show: ['freqMHz', 'rsMsps', 'mLevel'],
    story: 'Frequency and symbol rate match the work order for this C-band carrier, and the level is healthy.',
    signal: carrier({ rfMHz: 3950, loMHz: 5150, freqMHz: 1200 }), start: config({ freqMHz: 1200 }),
    fixed: 'When the LO is above the RF, L-band equals LO minus RF, so higher RF becomes lower L-band and the spectrum is flipped. C-band LNBs commonly use a 5150 MHz LO. Many modems detect this automatically, but one set manually must match.',
  },
  {
    title: 'No data during a storm', show: ['modemState', 'mEs', 'mModcod'],
    story: 'It is raining hard at this site, and customers report no data. Find what the modem can still tell you.',
    signal: carrier({ esN0Db: 9.5, floorDbm: SITE_FLOOR_DBM + 1 }), start: config({ modcod: '16APSK 3/4' }),
    fixed: 'The demodulator reads the MODCOD from the PLHEADER, so you do not set it here. With Es/N0 this low, FEC is failing because quality is below that MODCOD’s threshold. At a good Es/N0, suspect a stream or scrambling mismatch instead. Ask the transmit side for a more robust MODCOD, or restore the margin. Demod lock does not prove this is the right carrier, so verify its identity too.',
  },
  {
    title: 'Two things wrong', show: ['checkBox', 'modemState'],
    story: 'A C-band site was rebuilt from an old Ku-band configuration. Fix one problem at a time and watch which check fails next.',
    signal: carrier({ rfMHz: 3950, loMHz: 5150, freqMHz: 1200 }), start: config({ freqMHz: 1100 }),
    fixed: 'The modem can only report the first thing stopping it. Fixing the frequency revealed the spectral sense problem. That is why you work the checks in order.',
  },
];

export const firstFault = (ticket) => modemState(ticket.start, ticket.signal).failing;

export const REPORT_FIELDS = [
  ['start', 'Interference start time (UTC)', true, '2026-03-14 09:20'], ['end', 'End time, or ongoing', true, 'ongoing'], ['satellite', 'Satellite and transponder', true, 'SatLab-1, TP 7'],
  ['carrier', 'Affected carrier', true, 'Carrier ID or service name'], ['location', 'Receive location', true, 'Site name, lat/long'],
  ['frequency', 'Downlink RF center (MHz)', true, '12500.0, not L-band'], ['polarization', 'Polarization', true, 'H or V'], ['bandwidth', 'Interfering signal bandwidth (MHz)', true, '6'], ['type', 'Signal type', true, 'CW, modulated, swept'],
  ['level', 'Level, or C/I', false, 'C/I 8 dB'], ['pattern', 'Time pattern', false, 'steady, or every 8 s'], ['sites', 'Sites affected and not affected', true, 'Site A yes, Site B yes'], ['beacon', 'Beacon behavior', false, 'steady'],
  ['checks', 'Checks already done', true, 'pointing, cabling, LNB'], ['impact', 'Service impact', true, 'FEC failing, no traffic'], ['capture', 'Spectrum capture file names', true, 'tp7_0920.png'],
  ['captureSettings', 'Capture span and RBW', true, 'span 50 MHz, RBW 100 kHz'], ['contact', 'Your name and 24-hour contact', true, 'NOC desk phone'],
];

export const REPORT_EXAMPLE = {
  start: '2026-03-14 09:20', end: 'ongoing', satellite: 'SatLab-1 (fictional), TP 7', carrier: 'SATLAB CH 1', location: 'Training Site A', frequency: '12492.0', polarization: 'H',
  bandwidth: '6', type: 'Modulated, raised block with width', level: 'C/I about 8 dB', pattern: 'Steady since onset', sites: 'Sites A and B both affected', beacon: 'Steady at both sites',
  checks: 'Weather clear, pointing and cabling verified, own transmit chain off', impact: 'Demod locked, FEC failing, no traffic', capture: 'example_tp7_0920.png', captureSettings: 'Span 50 MHz, RBW 100 kHz',
  contact: 'Training NOC, 24-hour desk',
};

const NUMERIC = new Set(['frequency', 'bandwidth']);

function validUtc(text) {
  const m = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?(?: ?(?:UTC|Z))?$/);
  if (!m) return false;
  const date = new Date(`${m[1]}T${m[2]}:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${m[1]}T${m[2]}`); // Rejects rollovers like February 30.
}

export function buildReport(values) {
  const missing = REPORT_FIELDS.filter(([id, , required]) => required && !values[id]?.trim()).map(([, label]) => label);
  const wellFormed = (id, v) => (id === 'start' ? validUtc(v) : !NUMERIC.has(id) || (/^(\d+\.?\d*|\.\d+)$/.test(v) && Number(v) > 0));
  const invalid = REPORT_FIELDS.filter(([id]) => values[id]?.trim() && !wellFormed(id, values[id].trim())).map(([, label]) => label);
  const rf = Number(values.frequency);
  const warning = rf >= 950 && rf <= 2150 ? 'That frequency looks like L-band. Report the downlink RF unless this really is an L-band satellite.' : '';
  const lines = ['SATELLITE INTERFERENCE REPORT', ''];
  for (const [id, label] of REPORT_FIELDS) lines.push(`${label}: ${values[id]?.trim() || 'not provided'}`);
  return { text: lines.join('\n'), missing, invalid, warning };
}

export const ESCALATION = [
  ['Capture evidence first', 'Save spectrum captures with time, frequency, span and RBW before you change anything.'],
  ['Make non-invasive local checks', 'Check weather, the beacon, your own transmit status, recent changes, and whether cabling or the LNB looks wrong. If you connect an analyzer to a powered line, use a DC block.'],
  ['Call your NOC or service provider', 'They can confirm your carrier’s status and whether other customers are affected.'],
  ['Compare another site', 'With the NOC, compare sites. If only you are affected, suspect your site, pointing or local terrestrial interference. If every site is affected, it is probably on the satellite.'],
  ['Report to the satellite operator', 'Send this report to the operator’s control center. Operators can characterize and geolocate an uplink signal.'],
  ['Let the operator involve regulators', 'For persistent or intentional interference, the operator or the licensee works with the national regulator. Do not transmit anything to counter it.'],
];
