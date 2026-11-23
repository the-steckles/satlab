// Guided walkthrough. Each step sets the link, then explains it using the live budget.
import { backoffCurve, bestModcod, budget, DEFAULTS, pointingToleranceDeg, rainMarginDb } from './model.js';

const n = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('-', '−') : '–');

// True when the second-worst noise source is close enough to the worst that fixing one alone will not do much.
const closeTerms = (b) => {
  const [worst, next] = [b.cn0UpDbHz, b.cn0DownDbHz, b.cim0DbHz, b.distortion0DbHz].sort((x, y) => x - y);
  return next - worst < 3;
};

export const LESSONS = [
  {
    title: 'What a link budget is', set: {},
    text: ({ b }) => `A link budget adds up every gain and loss between the transmitter and the receiver, in dB. It answers one question: does enough signal arrive above the noise? This carrier ends with ${n(b.esN0Db)} dB Es/N0. ${b.p.modcod} needs ${n(b.needDb)} dB, so it has ${n(b.marginDb)} dB of margin. Follow the level diagram from left to right. Other labs use simplified versions of SatLab-1, so their numbers differ from this worked carrier.`,
  },
  {
    title: 'Uplink EIRP', set: {},
    text: ({ b }) => `EIRP is the power an ideal antenna would need to produce the same signal strength in the beam’s direction. Here ${n(b.p.txPowerW, 0)} W is ${n(b.txPowerDbw)} dBW. Subtract ${n(b.p.txLossDb)} dB of waveguide loss and add ${n(b.txGainDbi)} dBi of antenna gain to get ${n(b.eirpUpDbw)} dBW. Doubling the dish diameter adds 6 dB, the same as four times the power.`,
  },
  {
    title: 'Free-space path loss', set: {},
    text: ({ b }) => `Over ${Math.round(b.upRangeKm).toLocaleString('en-US')} km the uplink loses ${n(b.upPathDb)} dB. Nothing absorbs this power. It simply spreads over a huge sphere, and the loss formula also accounts for how small a receiving aperture is at this wavelength. It is the largest number in the budget, and you cannot change it.`,
  },
  {
    title: 'G/T: how good a receiver is', set: {},
    text: ({ b }) => `G/T is antenna gain divided by system noise temperature, in dB/K. It combines how much signal a receiver collects with how much noise it adds. This ${n(b.p.rxDishM)} m dish has ${n(b.rxGainDbi)} dBi of gain and a ${Math.round(b.tsysK)} K system, so its G/T is ${n(b.gtDbK)} dB/K. The satellite’s receive G/T is ${n(b.p.satGtDb)} dB/K, much lower because its antenna covers a wide area.`,
  },
  {
    title: 'Through the transponder', set: {},
    text: ({ b }) => `Saturated flux density (SFD) is the signal strength at the satellite that drives its TWTA to full output, here ${n(b.p.sfdDbWm2)} dBW/m². All carriers together arrive ${n(b.iboDb)} dB below that, which is the input backoff. The tube then runs ${n(b.oboDb)} dB below full output. This carrier gets its share of the ${n(b.p.satEirpDbw)} dBW maximum, or ${n(b.eirpDownDbw)} dBW.${b.neighborEirpDbw === null ? '' : ` Each other carrier gets ${n(b.neighborEirpDbw)} dBW. Raise your HPA power and watch that number fall: near saturation, your gain comes out of their share.`}`,
  },
  {
    title: 'The downlink', set: {},
    text: ({ b }) => `The satellite’s ${n(b.eirpDownDbw)} dBW loses ${n(b.downPathDb)} dB on the way down, and the dish adds ${n(b.rxGainDbi)} dBi. The carrier reaches the receiver at ${n(b.rxCarrierDbw)} dBW, which is about ${n(b.rxCarrierDbw + 30)} dBm. That is tiny, but the noise in the same bandwidth is only ${n(b.noiseInRsDbw + 30)} dBm.`,
  },
  {
    title: 'Why the weakest part wins', set: {},
    text: ({ b }) => `Noise from each part of the path adds at the receiver. In ${n(b.p.rsMsps)} MHz, the uplink alone gives ${n(b.cn0UpDbHz - 10 * Math.log10(b.p.rsMsps * 1e6))} dB, the downlink ${n(b.cn0DownDbHz - 10 * Math.log10(b.p.rsMsps * 1e6))} dB, ${Number.isFinite(b.cimDb) ? `intermodulation ${n(b.cimDb)} dB, ` : ''}and nonlinear distortion ${n(b.distortionDb)} dB. Together they make ${n(b.esN0Db)} dB, lower than any one of them. The largest noise source right now is the ${b.limitedBy.toLowerCase()}. ${closeTerms(b) ? 'The terms are within 3 dB of each other, so a balanced link needs improvement in more than one place.' : 'It dominates, so improving anything else helps very little.'}`,
  },
  {
    title: 'C/N, Es/N0, Eb/N0 and MER', set: {},
    text: ({ b }) => `These are four views of signal quality. C/N0 is ${n(b.cn0DbHz)} dB-Hz, a ratio per hertz that ignores bandwidth. C/N is ${n(b.cnOccupiedDb)} dB in the occupied bandwidth, which is what integrated channel power gives you. An analyzer marker from the carrier top to the floor reads (C+N)/N instead, about ${n(b.analyzerDeltaDb)} dB here. To convert it, C/N = 10·log10(10^(reading/10) − 1). With a narrow RBW, that result tracks Es/N0 except for constellation distortion, which an analyzer cannot see. If the analyzer looks healthy but MER is poor, suspect overdrive. Es/N0 is ${n(b.esN0Db)} dB per symbol, the number DVB-S2 thresholds use. Eb/N0 is ${n(b.ebN0Db)} dB per data bit, useful for comparing MODCODs. MER is ${n(b.merDb)} dB and is measured from the constellation, the plot of received symbols in amplitude and phase, so trust it for what the demodulator really sees.`,
  },
  {
    title: 'Rain', set: { downRainDb: 4 },
    text: ({ b }) => { const clear = { ...b.p, downRainDb: 0 }; return `Rain on the downlink is costing ${n(b.p.downRainDb)} dB of signal, and the wet air also raises the system temperature to ${Math.round(b.tsysK)} K. Margin is now ${n(b.marginDb)} dB. This setup can survive about ${n(rainMarginDb(clear))} dB of downlink rain. Link margin is mostly bought to survive rain, especially at Ku-band and above.`; },
  },
  {
    title: 'How close to peak is good enough?', set: { rxPointDeg: 0.4 },
    text: ({ b }) => { const t = pointingToleranceDeg(b.p); return `This dish has a ${n(b.rxBeamDeg, 2)}° beamwidth. Being ${n(b.p.rxPointDeg, 2)}° off costs ${n(b.rxPointLossDb)} dB, because loss grows with the square of the error. A common target is under 1 dB, which here means within ${n(t.oneDbDeg, 2)}°. ${t.closesPastBeam ? 'The link still closes at a full beamwidth off, though other satellites would then matter.' : `The link stops closing at ${n(t.closesDeg, 2)}°.`} A bigger dish has a narrower beam, so it needs tighter pointing.`; },
    see: { href: '/peaker/', text: 'Practice peaking: Peaker' },
  },
  {
    title: 'What backoff should I run?', set: { txPowerW: 120 },
    text: ({ b }) => { const c = backoffCurve(b.p); return `More uplink power helps until the tube compresses. The plot shows the tradeoff: uplink quality keeps rising, downlink quality flattens near saturation, and distortion worsens. ${c.bestAtEdge ? 'The best point is outside this plot, so check the settings.' : `Es/N0 peaks near ${n(c.best.iboDb)} dB IBO`}, and this link is at ${n(b.iboDb)} dB. ${b.neighborEirpDbw === null ? '' : `Your best point is not free: each neighbor is at ${n(b.neighborEirpDbw)} dBW here, against ${n(budget({ ...b.p, txPowerW: DEFAULTS.txPowerW }).neighborEirpDbw)} dBW at your nominal power, so a real backoff is agreed with the operator.`} Signs of overdrive are that more power stops raising the output, MER falls, and shoulders grow beside the carrier.`; },
    see: { href: '/mixers/?scene=satTx&lesson=3', text: 'See the tube saturate: Mixer Lab' },
  },
  {
    title: 'Choosing a MODCOD', set: {},
    text: ({ b }) => { const pick = bestModcod(b.p); return `A higher MODCOD carries more data but needs more Es/N0. ${b.p.modcod} carries about ${n(b.mbps)} Mbit/s here. With 1 dB in reserve, the fastest MODCOD this link supports is ${pick ?? 'none'}. In practice, leave enough margin for your site’s rain, or use adaptive coding to step down during a fade.`; },
  },
];
