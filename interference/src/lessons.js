// Guided experiments. Each sets a scenario, then explains it using the live link numbers.
import { lockShare } from './model.js';

const db = (v) => (!Number.isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
const plain = (v) => (!Number.isFinite(v) ? '–' : (Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−'));
const I = (x) => ({ interferer: { on: true, path: 'uplink', ...x } });

export const LESSONS = [
  {
    title: 'A healthy link', set: {}, view: 'A',
    text: ({ r }) => `SatLab-1 is a fictional satellite with one 36 MHz transponder and two carriers. Your carrier reaches Site A at ${plain(r.sites.A.esn0)} dB Es/N0. ${r.params.modcod} needs ${plain(r.need)} dB, leaving ${plain(r.sites.A.margin)} dB of margin. That margin is what absorbs rain, drift and interference.`,
  },
  {
    title: 'Interference adds to noise', set: I({ kind: 'cw', icDb: -15, offsetMHz: -8 }), view: 'A',
    text: ({ r }) => `A CW signal 15 dB below your carrier lands in its band. C/I is ${plain(r.sites.A.iDb)} dB, and it combines with the noise as C/(N+I), so Es/N0 drops to ${plain(r.sites.A.esn0)} dB. Margin is now ${plain(r.sites.A.margin)} dB. The tone looks taller than it should because the plot shows power density: the tone puts all its power in one 100 kHz bin, while your carrier spreads across 5 MHz. Height compares density, so compare total power with C/I.`,
  },
  {
    title: 'The cliff', set: I({ kind: 'cw', icDb: -7, offsetMHz: -8 }), view: 'A',
    text: ({ r }) => `Eight dB more interference takes margin to ${plain(r.sites.A.margin)} dB, and the receiver reports ${r.sites.A.state}. Coded links barely degrade until they run out of margin, then fail abruptly. Trend your Es/N0, because it warns you before service drops.`,
  },
  {
    title: 'Frequency decides who is hit', set: I({ kind: 'cw', icDb: -7, offsetMHz: 8 }), view: 'A',
    text: ({ r }) => `The same signal moved onto the other carrier. Yours is ${r.sites.A.state} with ${plain(r.sites.A.margin)} dB margin, and the other carrier is ${r.sites.A.neighborState} with ${plain(r.sites.A.neighborMargin)} dB. When one carrier in a transponder fails and its neighbor is fine, suspect something narrowband on that frequency.`,
  },
  {
    title: 'Spreading the same power', set: I({ kind: 'barrage', icDb: -7, offsetMHz: 0 }), view: 'A',
    text: ({ r }) => `Now the same total power covers the whole transponder, so only part of it falls on your carrier. C/I improves to ${plain(r.sites.A.iDb)} dB and margin is ${plain(r.sites.A.margin)} dB. On the analyzer this looks like a raised noise floor across the transponder rather than a distinct signal.`,
  },
  {
    title: 'Swept interference', set: I({ kind: 'swept', icDb: 0, offsetMHz: 0, spanMHz: 32, sweepS: 8 }), view: 'A',
    text: ({ r }) => `This signal repeatedly sweeps across the transponder. It only hurts while crossing a carrier, so the link is usable about ${Math.round(lockShare(r.params) * 100)}% of the time. Watch the diagonal track on the waterfall. Intermittent errors with a repeating period are a strong clue that a time-based view will catch and a single sweep could miss.`,
  },
  {
    title: 'Uplink or downlink?', set: I({ kind: 'cw', path: 'downlink', icDb: -7, offsetMHz: -8 }), view: 'A',
    text: ({ r }) => `This interference enters at Site A’s antenna, so Site A is ${r.sites.A.state} while Site B stays ${r.sites.B.state}. An uplink interferer would appear at both. Comparing two sites is one of the fastest ways to localize a problem. View Site B and the transponder output to confirm the signal is not on the satellite.`,
  },
  {
    title: 'Why a transponder shares power', set: {}, view: 'output',
    text: ({ r }) => `A transponder has one output amplifier for everything in its band. The tube can only turn so much DC power into RF, so all signals draw from one fixed budget. The bar below shows the split: your carrier has ${Math.round(r.shares.carrier * 100)}%, the other carrier ${Math.round(r.shares.neighbor * 100)}%, and uplink noise ${Math.round(r.shares.noise * 100)}%. The amplifier cannot tell signal from noise, so noise uses power too.`,
  },
  {
    title: 'Power robbing', set: I({ kind: 'cw', icDb: 10, offsetMHz: 0 }), view: 'output',
    text: ({ r }) => `A strong uplink signal sits between the carriers and overlaps neither, yet takes ${Math.round(r.shares.interference * 100)}% of the input. Near saturation the output can barely grow, so the tube’s fixed output is divided among more input. A strong tone is especially harsh, because a limiter suppresses weaker signals beyond their proportional share. Both carriers fall ${plain(r.robbedDb)} dB. Their uplink noise falls with them, but the downlink noise at the ground does not, and intermodulation rises, so margin is ${plain(r.sites.A.margin)} dB.`,
  },
  {
    title: 'Physics or protection?', set: { ...I({ kind: 'cw', icDb: 10, offsetMHz: 0 }), alc: true }, view: 'output',
    text: ({ r }) => `In fixed-gain mode, power robbing is pure physics: no circuit decides to reduce anything, the tube simply runs out of power. Some transponders also have automatic level control (ALC), turned on here. ALC is a real protection feature. It measures the input and adds attenuation to keep the tube’s drive constant. The output total stays put, and the carriers still drop ${plain(r.robbedDb)} dB because the attenuator turns everything down together. Either way, a strong signal takes power from its neighbors.`,
  },
  {
    title: 'Rain is not interference', set: { rainDb: 6 }, view: 'A',
    text: ({ r }) => `Rain at Site A cuts the carrier ${plain(-r.sites.A.carrierDeltaDb)} dB and raises the noise floor ${plain(r.sites.A.floorDeltaDb)} dB, because wet atmosphere radiates thermal noise. Site B is unaffected. Before reporting interference, rule out weather and pointing, and check whether a beacon dropped by the same amount.`,
  },
  {
    title: 'Responding: move or harden', set: { ...I({ kind: 'cw', icDb: -7, offsetMHz: -8 }), carrierMHz: -2, neighborMHz: 8 }, view: 'A',
    text: ({ r }) => `Moving your carrier off the interference restores it to ${r.sites.A.state} with ${plain(r.sites.A.margin)} dB margin. If you can’t move, try a more robust MODCOD in the controls, trading throughput for margin. Raising power rarely helps in a shared transponder, because it takes power from other users.`,
  },
  {
    title: 'Responding: report it', set: I({ kind: 'partial', icDb: 3, offsetMHz: -8, bwMHz: 6 }), view: 'input',
    text: () => 'Save a spectrum capture with the time, frequency, bandwidth and affected sites, then contact the satellite operator. Operators can compare the signal through two satellites to estimate where it came from, and most interference turns out to be accidental: misconfigured terminals, cross-polarization errors or faulty equipment. Intentional interference is illegal, and regulators handle it from there.',
  },
];
