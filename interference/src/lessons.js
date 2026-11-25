// Guided experiments. Each sets a scenario, then explains it using the live link numbers.
import { DEFAULTS, evaluate, lockShare, usableShare } from './model.js';
import { throughputMbps } from '../../lib/modcods.js';

const db = (v) => (!Number.isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
const plain = (v) => (!Number.isFinite(v) ? '–' : (Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−'));
const I = (x) => ({ interferer: { on: true, path: 'uplink', ...x } });

export const LESSONS = [
  {
    title: 'A healthy link', show: ['siteBox', 'modcod'], set: {}, view: 'A',
    see: { href: '/linkbudget/', text: 'See where this Es/N0 comes from: Link Budget Lab' },
    text: ({ r }) => `SatLab-1 is a fictional satellite with one 36 MHz transponder and two carriers. Your carrier reaches Site A at ${plain(r.sites.A.esn0)} dB Es/N0. ${r.params.modcod} needs ${plain(r.need)} dB, leaving ${plain(r.sites.A.margin)} dB of margin. That margin is what absorbs rain, drift and interference. This lab uses simplified link constants, including a 150 K receive system, so its numbers differ from the worked carrier in Link Budget Lab.`,
  },
  {
    title: 'Interference adds to noise', show: ['icDb', 'offsetMHz', 'specBox', 'siteBox'], set: I({ kind: 'cw', icDb: -15, offsetMHz: -8 }), view: 'A',
    text: ({ r }) => `A CW signal 15 dB below your carrier lands in its band. C/I is ${plain(r.sites.A.iDb)} dB, and it combines with the noise as C/(N+I), so Es/N0 drops to ${plain(r.sites.A.esn0)} dB. Margin is now ${plain(r.sites.A.margin)} dB. The tone looks taller than it should because the plot shows power density: the tone puts all its power in one 100 kHz bin, while your carrier spreads across 5 MHz. Height compares density, so compare total power with C/I.`,
  },
  {
    title: 'The cliff', show: ['icDb', 'siteBox'], set: I({ kind: 'cw', icDb: -7, offsetMHz: -8 }), view: 'A',
    text: ({ r }) => `Eight dB more interference takes margin to ${plain(r.sites.A.margin)} dB, and the receiver reports ${r.sites.A.state}. Coded links barely degrade until they run out of margin, then fail abruptly. Trend your Es/N0, because it warns you before service drops.`,
  },
  {
    title: 'Frequency decides who is hit', show: ['offsetMHz', 'siteBox'], set: I({ kind: 'cw', icDb: -7, offsetMHz: 8 }), view: 'A',
    text: ({ r }) => `The same signal moved onto the other carrier. Yours is ${r.sites.A.state} with ${plain(r.sites.A.margin)} dB margin, and the other carrier is ${r.sites.A.neighborState} with ${plain(r.sites.A.neighborMargin)} dB. When one carrier in a transponder fails and its neighbor is fine, suspect something narrowband on that frequency.`,
  },
  {
    title: 'Spreading the same power', show: ['iKind', 'specBox', 'siteBox'], set: I({ kind: 'barrage', icDb: -7, offsetMHz: 0 }), view: 'A',
    text: ({ r }) => `Now the same total power covers the whole transponder, so only part of it falls on your carrier. C/I improves to ${plain(r.sites.A.iDb)} dB and margin is ${plain(r.sites.A.margin)} dB. On the analyzer this looks like a raised noise floor across the transponder rather than a distinct signal.`,
  },
  {
    title: 'Swept interference', show: ['iKind', 'spanMHz', 'sweepS', 'specBox', 'siteBox'], set: I({ kind: 'swept', icDb: 0, offsetMHz: 0, spanMHz: 32, sweepS: 8 }), view: 'A',
    see: { href: '/dvbs2/?lesson=8', text: 'See the steps a receiver takes to reacquire: DVB-S2 Overlay Lab' },
    text: ({ r }) => `This signal repeatedly sweeps across the transponder. It hurts most while crossing a carrier, and its power also robs the tube the rest of the time. The link is above threshold about ${Math.round(lockShare(r.params) * 100)}% of the time. A modem also needs time to recover after each hit, so usable time is closer to ${Math.round(usableShare(r.params) * 100)}%. Watch the diagonal track on the waterfall. Intermittent errors with a repeating period are a strong clue that a time-based view will catch and a single sweep could miss.`,
  },
  {
    title: 'Reading the IQ plot: a tone', show: ['iqBox', 'specBox'], set: { ...I({ kind: 'cw', icDb: -9, offsetMHz: -8 }), modcod: 'QPSK 3/4' }, view: 'A',
    text: ({ r }) => `Each dot on the IQ plot is one received symbol, placed by its amplitude and phase. Each white cross is a position this modulation is allowed to send. QPSK makes the pattern easy to see. A CW tone adds a fixed-size vector that rotates against your symbols, so each point becomes a ring. Modulation error ratio (MER), measured from how far dots sit from the crosses, is about ${plain(r.sites.A.esn0)} dB. On the analyzer, the same tone is one thin line, and on the waterfall a steady stripe.`,
  },
  {
    title: 'Reading the IQ plot: a modulated signal', show: ['narrowMHz', 'iqBox', 'specBox'], set: { ...I({ kind: 'narrow', narrowMHz: 3, icDb: -9, offsetMHz: -8 }), modcod: 'QPSK 3/4' }, view: 'A',
    text: ({ r }) => `This interferer has the same power, but it is modulated across 3 MHz. It behaves like extra noise, so each point becomes a round cloud instead of a ring, with Es/N0 at ${plain(r.sites.A.esn0)} dB. Rings point to a tone, and clouds point to noise or a modulated signal. The analyzer confirms it: this one has visible width.`,
  },
  {
    title: 'Uplink or downlink?', show: ['iPath', 'siteBox', 'views'], set: I({ kind: 'cw', path: 'downlink', icDb: -7, offsetMHz: -8 }), view: 'A',
    text: ({ r }) => `This interference enters at Site A’s antenna, so Site A is ${r.sites.A.state} while Site B stays ${r.sites.B.state}. An uplink interferer would appear at both. Comparing two sites is one of the fastest ways to localize a problem. View Site B and the transponder output to confirm the signal is not on the satellite.`,
  },
  {
    title: 'Why a transponder shares power', show: ['powerBox'], set: {}, view: 'output',
    text: ({ r }) => `A transponder has one output amplifier for everything in its band. The tube can only turn so much DC power into RF, so all signals draw from one fixed budget. The bar below shows the split: your carrier has ${Math.round(r.shares.carrier * 100)}%, the other carrier ${Math.round(r.shares.neighbor * 100)}%, and uplink noise ${Math.round(r.shares.noise * 100)}%. The amplifier cannot tell signal from noise, so noise uses power too.`,
  },
  {
    title: 'Power robbing', show: ['icDb', 'views', 'powerBox', 'siteBox'], tx: true, set: I({ kind: 'cw', icDb: 10, offsetMHz: 0 }), view: 'output',
    see: { href: '/mixers/?scene=satTx&lesson=3', text: 'Review compression in the TWTA: Mixer Lab' },
    text: ({ r }) => `A strong uplink signal sits between the carriers and overlaps neither, yet takes ${Math.round(r.inputShare * 100)}% of the input and ${Math.round(r.shares.interference * 100)}% of the output. Near saturation the output can barely grow, so the tube’s fixed output is divided among more input. A strong tone is especially harsh, because a limiter suppresses weaker signals beyond their proportional share. Both carriers fall ${plain(r.robbedDb)} dB. Their uplink noise falls with them, but the downlink noise at the ground does not, and intermodulation rises, so margin is ${plain(r.sites.A.margin)} dB. Compare test points: at Satellite input your carriers still arrive at full level, and the loss appears only at Transponder output. Change the interference level or your carrier power, then switch between the two to see what each input level does to the output.`,
  },
  {
    title: 'Physics or protection?', show: ['alc', 'views', 'powerBox', 'siteBox'], tx: true, set: { ...I({ kind: 'cw', icDb: 10, offsetMHz: 0 }), alc: true }, view: 'output',
    text: ({ r }) => { const fixed = evaluate({ ...r.params, alc: false }); return `In fixed-gain mode, power robbing is pure physics: no circuit decides to reduce anything, the tube simply runs out of power. Some transponders also have automatic level control (ALC), turned on here. ALC is a real protection feature. It measures the input and adds attenuation to keep the tube’s drive constant. The output total stays put, and the carriers still drop ${plain(r.robbedDb)} dB because the attenuator turns everything down together. ALC also pulls the tube back out of overdrive, so C/IM improves from ${plain(fixed.sites.A.cim)} to ${plain(r.sites.A.cim)} dB. Either way, a strong signal takes power from its neighbors. Turn Transponder ALC off and on: Satellite input does not change, because ALC acts after it, and Transponder output shows the difference.`; },
  },
  {
    title: 'When ALC helps', show: ['trimDb', 'alc', 'views', 'siteBox'], tx: true, set: { alc: true, trimDb: -5, neighborTrimDb: -5 }, view: 'output',
    text: ({ r }) => { const fixed = evaluate({ ...r.params, alc: false }); return `ALC exists for this case. Both uplinks start 5 dB faded, perhaps from rain at the transmit site. At Satellite input your carrier arrives at ${db(r.params.trimDb)} dB. With ALC, the transponder adds ${plain(r.tp.alcDb)} dB of gain, so at Transponder output it is back to ${db(r.sites.B.carrierDeltaDb)} dB and your Es/N0 is ${plain(r.sites.A.esn0)} dB. In fixed-gain mode it would be ${plain(fixed.sites.A.esn0)} dB. Turn ALC off to see the fade pass straight through, or lower Carrier power to deepen the fade. The tradeoff is the previous lesson: ALC cannot tell a fade from a strong interferer, and its range is limited to 15 dB.`; },
  },
  {
    title: 'Rain is not interference', show: ['rainDb', 'specBox', 'beaconRow', 'siteBox'], set: { rainDb: 6 }, view: 'A',
    see: { href: '/peaker/', text: 'See how a beacon is measured: Peaker' },
    text: ({ r }) => `Rain at Site A cuts the carrier ${plain(-r.sites.A.carrierDeltaDb)} dB and raises the noise floor ${plain(r.sites.A.floorDeltaDb)} dB, because wet atmosphere radiates thermal noise. Site B is unaffected. The beacon, the line marked Beacon at the right of the spectrum, fell ${plain(-r.sites.A.beaconDeltaDb)} dB too, as the Beacon level row shows. That is the giveaway. The satellite sends its beacon on its own path, outside the transponder, so a beacon drop means propagation or pointing, while interference leaves the beacon alone. Move the rain slider and watch the beacon follow it.`,
  },
  {
    title: 'Cross-pol or a co-pol signal?', show: ['pol', 'iPath', 'specBox', 'siteBox'], set: I({ source: 'xpol', kind: 'partial', icDb: -3, offsetMHz: -6, bwMHz: 8 }), view: 'A',
    text: ({ r }) => `This signal has width and reaches both sites, so it is on the satellite, but that does not say where it came from. Set Polarization above the spectrum to Opposite. There the same signal is ${plain(r.sites.A.oppositePolDb)} dB stronger and your own carriers almost vanish, so it belongs to the other polarization and only that much isolation separates them. A well-aligned feed usually gives 30 dB or more. An uplink feed problem shows at every site, while a skewed receive feed shows at only that site. Set the path to Downlink to compare.`,
  },
  {
    title: 'Adjacent satellite or local?', show: ['mispointDb', 'specBox', 'beaconRow'], set: { ...I({ source: 'asi', kind: 'partial', path: 'downlink', icDb: -14, offsetMHz: -8, bwMHz: 10 }), mispointDb: 2 }, view: 'A',
    text: ({ r }) => `Only Site A is affected, which suggests something at that site. The beacon is the clue: the Beacon line at the right of the spectrum is down ${plain(-r.sites.A.beaconDeltaDb)} dB, so this antenna is off peak. A mispointed or small dish has a beam wide enough to receive a neighboring satellite. A truly local emitter would leave the beacon unchanged. Move the mispointing slider to 0 dB. The neighbor falls about 3 dB for each 1 dB your carrier recovers, because you are moving back off its side of the beam. C/I is ${plain(r.sites.A.iDb)} dB now.`,
  },
  {
    title: 'Responding: move or harden', show: ['carrierMHz', 'modcod', 'siteBox'], set: I({ kind: 'cw', icDb: -7, offsetMHz: -8 }), view: 'A',
    text: ({ r }) => {
      const p = r.params, a = r.sites.A, start = DEFAULTS.modcod, mbps = (m) => throughputMbps(m, p.rsMHz).toFixed(0);
      const onIt = Math.abs(p.interferer.offsetMHz - p.carrierMHz) < p.rsMHz * 0.6, status = `${a.state} with ${plain(a.margin)} dB margin`;
      const power = 'Raising power rarely helps in a shared transponder, because it takes power from other users.';
      if (!onIt) return `Moving your carrier off the interference restores it to ${status}, at the full ${mbps(p.modcod)} Mbit/s of ${p.modcod}. Moving needs a clear slot in the transponder and the operator’s agreement, and it leaves the interferer in place for whoever uses that frequency next, so still report it. ${power}`;
      if (p.modcod === start) return `Your carrier sits on the interference and is ${status}. You have two ways out. Move it: drag Position in transponder until the carrier clears the tone, for example to −2 MHz. Or harden it: choose a more robust MODCOD, such as QPSK 3/4, which needs less Es/N0. Try one, then come back and try the other.`;
      if (a.margin < 0) return `${p.modcod} needs ${plain(r.need)} dB, still more than the ${plain(a.esn0)} dB your carrier has on the interference, so it is ${a.state}. Choose a more robust MODCOD, or move the carrier instead.`;
      return `${p.modcod} needs only ${plain(r.need)} dB, so your carrier is ${status} while still sitting on the interference. The cost is throughput: about ${mbps(p.modcod)} Mbit/s instead of ${mbps(start)}. Hardening keeps your frequency but gives up capacity, and the interference is still there if it grows. ${power}`;
    },
  },
  {
    title: 'Responding: report it', show: ['specBox'],
    see: { href: '/troubleshoot/', text: 'Build a report: Field Troubleshooter' }, set: I({ kind: 'partial', icDb: 3, offsetMHz: -8, bwMHz: 6 }), view: 'input',
    text: () => 'Save a spectrum capture with the time, frequency, bandwidth and affected sites, then contact the satellite operator. Operators can compare the signal through two satellites to estimate where it came from, and most interference turns out to be accidental: misconfigured terminals, cross-polarization errors or faulty equipment. Intentional interference is illegal, and regulators handle it from there.',
  },
];
