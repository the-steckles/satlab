// Guided walkthrough. Each step sets the link, then explains it using the live budget.
import { BACKOFF_MAX_DB, backoffCurve, bestModcod, budget, DEFAULTS, pointingToleranceDeg, rainMarginDb } from './model.js';

const n = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('-', '−') : '–');

// Each noise source on its own, as C/N in the symbol bandwidth. A lone carrier has no intermodulation term.
const noiseTerms = (b) => {
  const rs = 10 * Math.log10(b.p.rsMsps * 1e6);
  return [['the uplink', b.cn0UpDbHz], ['the downlink', b.cn0DownDbHz], ['intermodulation', b.cim0DbHz], ['nonlinear distortion', b.distortion0DbHz]]
    .filter(([, v]) => Number.isFinite(v)).map(([name, v]) => ({ name, db: v - rs, times: Math.round(10 ** ((v - rs) / 10)) }));
};
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);

// The tube's output is shared, so the neighbours move the opposite way to your power.
function sharing(b) {
  const nominal = budget({ ...b.p, txPowerW: DEFAULTS.txPowerW }).neighborEirpDbw, diff = b.neighborEirpDbw - nominal;
  const watts = (w) => `${Number(w.toPrecision(3))} W`, at = `At ${watts(b.p.txPowerW)}, each other carrier gets ${n(b.neighborEirpDbw)} dBW of downlink`;
  const why = 'That is why the satellite operator, not your station, sets each carrier’s uplink power, and why you change it only with their agreement.';
  if (Math.abs(diff) < 0.05) return `The tube’s output is shared, so turning your carrier up would lower every other carrier’s downlink. ${why}`;
  return diff < 0
    ? `Turning your carrier up is not free for everyone else. ${at}, down from ${n(nominal)} dBW at your nominal ${watts(DEFAULTS.txPowerW)}, because the tube’s output is shared and your carrier now takes more of it. ${why}`
    : `The tube’s output is shared, so whatever power your carrier takes comes from the others. ${at}, up from ${n(nominal)} dBW at your nominal ${watts(DEFAULTS.txPowerW)}, because your carrier now takes less of it. ${why}`;
}

function noiseAddsUp(b) {
  const terms = noiseTerms(b), [low, next] = [...terms].sort((x, y) => x.db - y.db);
  const total = 10 ** (b.esN0Db / 10), times = (v) => Math.round(v).toLocaleString('en-US');
  const ratios = list(terms.map((t, i) => (i ? `${t.name} ${n(t.db)} dB` : `${t.name} has a carrier-to-noise ratio of ${n(t.db)} dB`)));
  const close = next && next.db - low.db < 3
    ? `${low.name[0].toUpperCase()}${low.name.slice(1)} and ${next.name} are within 3 dB of each other, so improving only one of them buys little.`
    : 'It is well below the others, so improving anything else helps very little.';
  return `Each part of the path adds its own noise to your carrier. Measured alone in the ${n(b.p.rsMsps)} Msym/s symbol bandwidth, ${ratios}. A higher ratio means less noise. Your demodulator sees all of that noise at once, so the noise powers add. As plain ratios, the carrier is ${list(terms.map((t) => times(t.times)))} times stronger than each noise source. Add the noise as fractions of the carrier: ${terms.map((t) => `1/${times(t.times)}`).join(' + ')} = about 1/${times(total)}. The carrier is about ${times(total)} times the total noise, which is ${n(b.esN0Db)} dB, lower than every single ratio. The lowest ratio, ${low.name}, contributes the most noise. ${close} This total is the Es/N0 in the Result panel. For a DVB-S2 carrier it is the carrier-to-noise ratio measured in the symbol bandwidth, as every number above was, and it is the figure the demodulator needs. The next step covers it and its close relatives.`;
}

export const LESSONS = [
  {
    title: 'What a link budget is', show: ['ladderBox', 'rEs', 'rNeed', 'rMargin', 'modcod'], set: {},
    text: ({ b }) => `A link budget adds up every gain and loss between the transmitter and the receiver, in dB. It answers one question: does enough signal arrive above the noise? This carrier ends with ${n(b.esN0Db)} dB Es/N0. ${b.p.modcod} needs ${n(b.needDb)} dB, so it has ${n(b.marginDb)} dB of margin. Follow the level diagram from left to right. Other labs use simplified versions of SatLab-1, so their numbers differ from this worked carrier.`,
  },
  {
    title: 'Uplink EIRP', show: ['txPowerW', 'txLossDb', 'txDishM', 'stage:HPA', 'stage:Uplink EIRP', 'row:Transmit power', 'row:Waveguide loss', 'row:Transmit antenna gain', 'row:Uplink EIRP'], set: {},
    text: ({ b }) => `EIRP is the power an ideal antenna would need to produce the same signal strength in the beam’s direction. Here ${n(b.p.txPowerW, 0)} W is ${n(b.txPowerDbw)} dBW. Subtract ${n(b.p.txLossDb)} dB of waveguide loss and add ${n(b.txGainDbi)} dBi of antenna gain to get ${n(b.eirpUpDbw)} dBW. Doubling the dish diameter adds 6 dB, the same as four times the power.`,
  },
  {
    title: 'Free-space path loss', show: ['stage:At satellite', 'row:Uplink path loss'], set: {},
    text: ({ b }) => `Over ${Math.round(b.upRangeKm).toLocaleString('en-US')} km the uplink loses ${n(b.upPathDb)} dB. Nothing absorbs this power. It simply spreads over a huge sphere, and the loss formula also accounts for how small a receiving aperture is at this wavelength. It is the largest number in the budget, and you cannot change it.`,
  },
  {
    title: 'G/T: how good a receiver is', show: ['rxDishM', 'rxTempK', 'satGtDb', 'row:Satellite G/T', 'row:Receive G/T'], set: {},
    text: ({ b }) => `G/T is antenna gain divided by system noise temperature, in dB/K. It combines how much signal a receiver collects with how much noise it adds. This ${n(b.p.rxDishM)} m dish has ${n(b.rxGainDbi)} dBi of gain and a ${Math.round(b.tsysK)} K system, so its G/T is ${n(b.gtDbK)} dB/K. The satellite’s receive G/T is ${n(b.p.satGtDb)} dB/K, much lower because its antenna covers a wide area.`,
  },
  {
    title: 'Through the transponder', show: ['sfdDbWm2', 'satEirpDbw', 'otherCarriers', 'txPowerW', 'stage:Downlink EIRP', 'row:Input backoff', 'row:Output backoff', 'row:Downlink EIRP for this carrier', 'row:Downlink EIRP, each other carrier'], set: {},
    text: ({ b }) => `Saturated flux density (SFD) is the signal strength at the satellite that drives its TWTA to full output, here ${n(b.p.sfdDbWm2)} dBW/m². All carriers together arrive ${n(b.iboDb)} dB below that, which is the input backoff. The tube then runs ${n(b.oboDb)} dB below full output. This carrier gets its share of the ${n(b.p.satEirpDbw)} dBW maximum, or ${n(b.eirpDownDbw)} dBW.${b.neighborEirpDbw === null ? '' : ` Each other carrier gets ${n(b.neighborEirpDbw)} dBW. Raise your HPA power and watch that number fall: near saturation, your gain comes out of their share.`}`,
  },
  {
    title: 'The downlink', show: ['stage:Downlink EIRP', 'stage:At dish', 'stage:After antenna', 'row:Downlink path loss', 'row:Receive G/T'], set: {},
    text: ({ b }) => `The satellite’s ${n(b.eirpDownDbw)} dBW loses ${n(b.downPathDb)} dB on the way down, and the dish adds ${n(b.rxGainDbi)} dBi. The carrier reaches the receiver at ${n(b.rxCarrierDbw)} dBW, which is about ${n(b.rxCarrierDbw + 30)} dBm. That is tiny, but the noise in the same bandwidth is only ${n(b.noiseInRsDbw + 30)} dBm.`,
  },
  {
    title: 'Noise adds up', show: ['rEs', 'rLimit'], set: {},
    text: ({ b }) => noiseAddsUp(b),
  },
  {
    title: 'C/N, Es/N0, Eb/N0 and MER', show: ['rCn0', 'rCn', 'rEs', 'rEb', 'rMer'], set: {},
    text: ({ b }) => `These are four views of signal quality. C/N0 is ${n(b.cn0DbHz)} dB-Hz, a ratio per hertz that ignores bandwidth. C/N is ${n(b.cnOccupiedDb)} dB in the occupied bandwidth, which is what integrated channel power gives you. An analyzer marker from the carrier top to the floor reads (C+N)/N instead, about ${n(b.analyzerDeltaDb)} dB here. To convert it, C/N = 10·log10(10^(reading/10) − 1). With a narrow RBW, that result tracks Es/N0 except for constellation distortion, which an analyzer cannot see. If the analyzer looks healthy but MER is poor, suspect overdrive. Es/N0 is ${n(b.esN0Db)} dB per symbol, the number DVB-S2 thresholds use. Eb/N0 is ${n(b.ebN0Db)} dB per data bit, useful for comparing MODCODs. MER is ${n(b.merDb)} dB and is measured from the constellation, the plot of received symbols in amplitude and phase, so trust it for what the demodulator really sees.`,
  },
  {
    title: 'Rain', show: ['downRainDb', 'stage:At dish', 'rMargin', 'rRain'], set: { downRainDb: 4 },
    text: ({ b }) => { const clear = { ...b.p, downRainDb: 0 }; return `Rain on the downlink is costing ${n(b.p.downRainDb)} dB of signal, and the wet air also raises the system temperature to ${Math.round(b.tsysK)} K. Margin is now ${n(b.marginDb)} dB. This setup can survive about ${n(rainMarginDb(clear))} dB of downlink rain. Link margin is mostly bought to survive rain, especially at Ku-band and above.`; },
  },
  {
    title: 'How close to peak is good enough?', show: ['rxPointDeg', 'rxDishM', 'row:Receive pointing loss', 'rPoint'], set: { rxPointDeg: 0.4 },
    text: ({ b }) => { const t = pointingToleranceDeg(b.p); return `This dish has a ${n(b.rxBeamDeg, 2)}° beamwidth. Being ${n(b.p.rxPointDeg, 2)}° off costs ${n(b.rxPointLossDb)} dB, because loss grows with the square of the error. A common target is under 1 dB, which here means within ${n(t.oneDbDeg, 2)}°. ${t.closesPastBeam ? 'The link still closes at a full beamwidth off, though other satellites would then matter.' : `The link stops closing at ${n(t.closesDeg, 2)}°.`} A bigger dish has a narrower beam, so it needs tighter pointing.`; },
    see: { href: '/peaker/', text: 'Practice peaking: Peaker' },
  },
  {
    title: 'What backoff should I run?', show: ['backoffBox', 'txPowerW', 'row:Input backoff', 'row:Downlink EIRP, each other carrier'], set: { txPowerW: 120 },
    text: ({ b }) => { const c = backoffCurve(b.p), capped = c.rows.length && c.rows.at(-1).iboDb < BACKOFF_MAX_DB - 0.5; return `More uplink power helps until the satellite’s tube compresses. The Choosing a backoff plot shows the tradeoff. Its horizontal axis is input backoff, how far below saturation all carriers together drive the tube, so moving right means less uplink power. The colored lines are the four carrier-to-noise ratios from the Noise adds up step, and the white line is their total, the Es/N0. Moving right, the uplink and downlink ratios fall because less power goes up and comes back down. Moving left, the tube nears saturation, so the downlink stops improving while intermodulation and distortion get worse. ${c.bestAtEdge ? 'The best point is outside this plot, so check the settings.' : `The white total peaks where these balance, marked with a dot near ${n(c.best.iboDb)} dB backoff.`} The dashed line is this link, at ${n(b.iboDb)} dB.${capped ? ' The shaded area on the right is out of reach, because the other carriers alone already drive the tube that hard.' : ''} ${b.neighborEirpDbw === null ? '' : sharing(b)} Signs of overdrive are that more power stops raising the output, MER falls, and shoulders grow beside the carrier.`; },
    see: { href: '/mixers/?scene=satTx&lesson=3', text: 'See the tube saturate: Mixer Lab' },
  },
  {
    title: 'Choosing a MODCOD', show: ['modcod', 'rRate', 'rBest', 'rMargin'], set: {},
    text: ({ b }) => { const pick = bestModcod(b.p); return `A higher MODCOD carries more data but needs more Es/N0. ${b.p.modcod} carries about ${n(b.mbps)} Mbit/s here. With 1 dB in reserve, the fastest MODCOD this link supports is ${pick ?? 'none'}. In practice, leave enough margin for your site’s rain, or use adaptive coding to step down during a fade.`; },
  },
];
