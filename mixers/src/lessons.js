// Guided experiments. Each sets the controls, then explains the result using live numbers.
const db = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
const mhz = (v) => `${+v.toFixed(3)} MHz`;

export const LESSONS = {
  bench: [
    {
      title: 'Sum and difference', set: {}, span: 'all',
      text: ({ r, s, node }) => `Multiplying ${mhz(r.params.rfMHz)} by a ${mhz(r.params.loMHz)} LO creates a difference at ${mhz(Math.abs(r.params.rfMHz - r.params.loMHz))} and a sum at ${mhz(r.params.rfMHz + r.params.loMHz)}. The wanted product is ${db(s.carrier?.dbm)} dBm, so this mixer has ${(r.params.rfDbm - (s.carrier?.dbm ?? 0)).toFixed(1)} dB of conversion loss. Weaker lines are real products too. Hover over or tap them to read their names. ${node.products.length} products are being tracked.`,
    },
    {
      title: 'Filter the IF', set: { filtersOn: true }, span: 'all',
      text: ({ s }) => `A mixer has no idea which product you want, so a filter after it keeps the difference and rejects the rest. With the low-pass in, the strongest unwanted product is ${db(s.worstDbc)} dBc (${s.worst?.label ?? 'none'}).`,
    },
    {
      title: 'The image problem', set: { imageOn: true, imageDbm: -10 }, span: 'near',
      text: ({ r, s }) => `A signal at ${mhz(r.imageMHz)} is the same distance from the LO, on the other side. It converts to exactly the same IF, at ${db(s.imageDbc)} dBc against your carrier, and no filter after the mixer can separate them. That is why image rejection has to happen before the mixer.`,
    },
    {
      title: 'Why balance matters', set: { mixerType: 'single', filtersOn: false, imageOn: false }, span: 'all',
      text: ({ s }) => `A single-ended mixer passes much of its inputs straight through. LO leakage at the output is ${db(s.loDbc)} dBc, and the worst unwanted product is ${s.worst?.label ?? 'none'}. Switch to Single-balanced and Double-balanced to watch the feedthrough and even-order products drop.`,
    },
    {
      title: 'Double-balanced mixer', set: { mixerType: 'double' }, span: 'all',
      text: ({ s }) => `Diode-ring symmetry cancels even-order LO products and isolates the ports. LO leakage is now ${db(s.loDbc)} dBc. Odd products like 3·LO remain because they are inherent to a switch.`,
    },
    {
      title: 'Starve the LO', set: { loDbm: -3 }, span: 'all',
      text: ({ r, s }) => `A mixer needs enough LO drive to switch its diodes fully. At ${db(r.params.loDbm)} dBm, the wanted product falls to ${db(s.carrier?.dbm)} dBm. In the field, higher conversion loss with a correct input level often points to a weak LO.`,
    },
    {
      title: 'Two tones reveal linearity', set: { loDbm: 7, twoTone: true, rfDbm: -20 }, span: 'near',
      text: ({ s }) => `Two close carriers create third-order products at 2f1 − f2 and 2f2 − f1. They sit right next to the carriers, so filters cannot remove them. Here they are ${db(s.im3Dbc)} dBc.`,
    },
    {
      title: 'The 3:1 rule', set: { rfDbm: -10 }, span: 'near',
      text: ({ s }) => `Raising the input 10 dB raised the carriers about 10 dB, and the third-order products about 30 dB. They are now ${db(s.im3Dbc)} dBc. Extend those two slopes on the plot and they meet at the intercept point, IP3. This chain measures ${db(s.oip3)} dBm at its output.`,
    },
    {
      title: 'High-side LO flips the spectrum', set: { loMHz: 2300, rfDbm: -20 }, span: 'near',
      text: ({ r, s }) => `With the LO above the RF, IF = LO − RF. A higher RF now gives a lower IF, so the spectrum is inverted. The product at ${mhz((s.carrier?.hz ?? 0) / 1e6)} is ${s.carrier?.label}. Modems need to know this, because inverted carriers will not lock without the matching setting.`,
    },
  ],
  groundUp: [
    {
      title: 'Up to Ku-band', set: {}, span: 'near',
      text: ({ r, s, node }) => `The modem’s ${mhz(r.params.rfMHz)} carrier leaves the HPA near ${mhz(r.wantedMHz)} at ${db(s.carrier?.dbm)} dBm per tone, ${db(node.gainDb)} dB of total gain. Click any block to probe the signal at that point.`,
    },
    {
      title: 'Why the Tx filter is there', set: { filtersOn: false }, span: 'all',
      text: ({ r, s }) => `Without the band filter, the HPA also amplifies the LO and the unwanted sideband near ${mhz(Math.abs(r.params.loMHz - r.params.rfMHz))}. The worst unwanted product is ${s.worst?.label ?? 'none'} at ${db(s.worstDbc)} dBc, which would radiate out of band and waste HPA power.`,
    },
    {
      title: 'Overdrive the HPA', set: { filtersOn: true, rfDbm: -15 }, span: 'near',
      text: ({ s }) => `Pushing the modem level 15 dB harder drives the HPA toward compression. Third-order products are now ${db(s.im3Dbc)} dBc. These land in neighboring channels, so uplink power is limited by linearity, not just by the HPA’s rating.`,
    },
  ],
  satRx: [
    {
      title: 'A very weak arrival', set: {}, span: 'near',
      text: ({ r, node, s }) => `The uplink arrives at ${db(r.params.rfDbm)} dBm per tone. After the LNA, a ${mhz(r.params.loMHz)} LO shifts it to ${mhz(r.wantedMHz)}, leaving at ${db(s.carrier?.dbm)} dBm. The chain’s noise figure is ${node.nfDb.toFixed(2)} dB, set almost entirely by the first stages.`,
    },
    {
      title: 'Image on the satellite', set: { filtersOn: false, imageOn: true, imageDbm: -80 }, span: 'near',
      text: ({ r, s }) => `Energy near ${mhz(r.imageMHz)} would land on the same channel at ${db(s.imageDbc)} dBc. With no input filter, that noise and interference fold straight into your transponder.`,
    },
    {
      title: 'Input filter restored', set: { filtersOn: true, imageOn: true, imageDbm: -80 }, span: 'near',
      text: ({ s }) => `With the receive filter in, the image contribution drops to ${db(s.imageDbc)} dBc. Filtering ahead of the mixer protects every channel behind it.`,
    },
  ],
  satTx: [
    {
      title: 'Operating with backoff', set: {}, span: 'near',
      text: ({ s }) => `The TWTA is backed off from saturation. Each tone leaves at ${db(s.carrier?.dbm)} dBm, and third-order products are ${db(s.im3Dbc)} dBc.`,
    },
    {
      title: 'Into saturation', set: { rfDbm: -42 }, span: 'near',
      text: ({ s }) => `Adding 10 dB of drive gives far less than 10 dB more output, because the tube is saturating. Each tone is now ${db(s.carrier?.dbm)} dBm, and third-order products have climbed to ${db(s.im3Dbc)} dBc. This is why multi-carrier transponders run with backoff.`,
    },
    {
      title: 'Backing off', set: { rfDbm: -62 }, span: 'near',
      text: ({ s }) => `Backing the input off gives up output power, now ${db(s.carrier?.dbm)} dBm per tone, but third-order products fall to ${db(s.im3Dbc)} dBc. Operators choose this tradeoff for each transponder.`,
    },
  ],
  groundDown: [
    {
      title: 'Inside an LNB', set: {}, span: 'all',
      text: ({ r, node, s }) => `The LNB turns a ${db(r.params.rfDbm)} dBm Ku-band carrier into ${db(s.carrier?.dbm)} dBm at ${mhz(r.wantedMHz)}, using a ${mhz(r.params.loMHz)} LO. Its ${node.nfDb.toFixed(2)} dB noise figure is nearly all the LNA’s, because its high gain hides the noise of later stages.`,
    },
    {
      title: 'Remove the image filter', set: { filtersOn: false }, span: 'near',
      text: ({ r, s }) => `A strong signal at ${mhz(r.imageMHz)} now converts directly onto your IF at ${db(s.imageDbc)} dBc. On a spectrum analyzer this looks like interference appearing from nowhere, even though the signal is nowhere near your carrier’s frequency.`,
    },
    {
      title: 'Restore the image filter', set: { filtersOn: true }, span: 'near',
      text: ({ s }) => `With the filter back between the LNA and mixer, the image falls to ${db(s.imageDbc)} dBc. A filter after the mixer could not do this, because by then the image and the carrier share one frequency.`,
    },
  ],
};
