// Guided experiments. Each sets the controls, then explains the result using live numbers.
import { amplifierBackoff } from './model.js';

const db = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
const mhz = (v) => `${+v.toFixed(3)} MHz`;
const backoffText = (r) => { const b = amplifierBackoff(r, 'twta'); return `The TWTA is ${b.iboDb < 0 ? `driven ${(-b.iboDb).toFixed(1)} dB past saturation` : `at ${b.iboDb.toFixed(1)} dB input backoff`} and ${b.oboDb.toFixed(1)} dB output backoff`; };

export const LESSONS = {
  bench: [
    {
      title: 'Sum and difference', show: ['rfMHz', 'loMHz', 'specBox', 'mCarrier'], set: {}, span: 'all',
      text: ({ r, s, node }) => `Multiplying ${mhz(r.params.rfMHz)} by a ${mhz(r.params.loMHz)} LO creates a difference at ${mhz(Math.abs(r.params.rfMHz - r.params.loMHz))} and a sum at ${mhz(r.params.rfMHz + r.params.loMHz)}. The wanted product is ${db(s.carrier?.dbm)} dBm${s.carrier ? `, so this mixer has ${(r.params.rfDbm - s.carrier.dbm).toFixed(1)} dB of conversion loss` : ''}. Weaker lines are real products too. Hover over or tap them to read their names. ${node.products.length} products are being tracked.`,
    },
    {
      title: 'You choose the product', show: ['product', 'filtersOn', 'specBox'], set: { product: 'sum', filtersOn: true }, span: 'all',
      text: ({ r, s }) => `The mixer always makes both sidebands. The filter decides which one you use. It now keeps F1 + LO at ${mhz(r.wantedMHz)}, at ${db(s.carrier?.dbm)} dBm. Use Wanted product to try each option. Real equipment uses all three: F1 + LO, F1 − LO and LO − F1, depending on the frequency plan.`,
    },
    {
      title: 'Filter the difference', show: ['product', 'chain:ifFilter', 'filterBox', 'mWorst'], set: { product: 'rfMinusLo', filtersOn: true }, span: 'all',
      text: ({ s }) => `Back to F1 − LO. A mixer has no idea which product you want, so a filter after it keeps that one and rejects the rest. With the filter in, the strongest unwanted product is ${db(s.worstDbc)} dBc (${s.worst?.label ?? 'none'}).`,
    },
    {
      title: 'What an image is', show: ['imageOn', 'imageDbm', 'planBox', 'specBox'], set: { imageOn: true, imageDbm: -10 }, span: 'near',
      text: ({ r, s }) => `Subtraction loses the sign: ${+r.params.rfMHz} − ${+r.params.loMHz} and ${+r.params.loMHz} − ${+r.imageMHz} are both ${+r.wantedMHz}. So a mixer converts signals from both sides of its LO to the same output. Your input is at ${mhz(r.params.rfMHz)}, and its mirror across the LO, the image, is at ${mhz(r.imageMHz)}. Anything there lands on your carrier, here at ${db(s.imageDbc)} dBc. The diagram shows the two equal distances. After mixing they occupy one frequency, so only a filter before the mixer can remove the image.`,
    },
    {
      title: 'Why balance matters', show: ['mixerType', 'mWorst', 'specBox'], set: { mixerType: 'single', filtersOn: false, imageOn: false }, span: 'all',
      text: ({ s }) => `A single-ended mixer passes much of its inputs straight through. LO leakage at the output is ${db(s.loDbc)} dBc, and the worst unwanted product is ${s.worst?.label ?? 'none'}. Switch to Single-balanced and Double-balanced to watch the feedthrough and even-order products drop.`,
    },
    {
      title: 'Double-balanced mixer', show: ['mixerType', 'specBox'], set: { mixerType: 'double' }, span: 'all',
      text: ({ s }) => `Diode-ring symmetry cancels even-order LO products and isolates the ports. LO leakage is now ${db(s.loDbc)} dBc. Odd-order products such as 3·LO − F1 remain, because a switching mixer multiplies by a near square wave, which contains odd harmonics.`,
    },
    {
      title: 'Starve the LO', show: ['loDbm', 'mCarrier', 'mIip3'], set: { loDbm: -3 }, span: 'all',
      text: ({ r, s, node }) => `A mixer needs enough LO drive to switch its diodes fully. At ${db(r.params.loDbm)} dBm, the wanted product is ${db(s.carrier?.dbm)} dBm and the input intercept is ${db(node.iip3Dbm)} dBm, so a starved mixer is both lossier and less linear. In the field, higher conversion loss with a correct input level often points to a weak LO.`,
    },
    {
      title: 'Two tones reveal linearity', show: ['twoTone', 'specBox', 'mIm3'], set: { loDbm: 7, twoTone: true, rfDbm: -20 }, span: 'near',
      text: ({ s }) => `Two close carriers create third-order products at 2f1 − f2 and 2f2 − f1. They sit right next to the carriers, so filters cannot remove them. Here they are ${db(s.im3Dbc)} dBc.`,
    },
    {
      title: 'The 3:1 rule', show: ['rfDbm', 'mIm3', 'mOip3', 'slope'], set: { rfDbm: -10 }, span: 'near',
      text: ({ s }) => `Raising the input 10 dB raised the carriers about 10 dB, and the third-order products about 30 dB. They are now ${db(s.im3Dbc)} dBc. Extend those two slopes on the plot and they meet at the intercept point, IP3. This chain measures ${db(s.oip3)} dBm at its output.`,
    },
    {
      title: 'Compression and saturation', show: ['rfDbm', 'mCarrier', 'mP1', 'slope'], set: { twoTone: false, rfDbm: 10 }, span: 'near',
      text: ({ r, s, node }) => `Every device has a limit on how much power it can deliver. Near that limit, more input yields less additional output. This is compression, and P1dB is the point where gain has dropped 1 dB. Pushed further, output stops rising at all. That is saturation. At ${db(r.params.rfDbm)} dBm in, an ideal mixer would output ${db(r.params.rfDbm + node.gainDb)} dBm, but this one gives ${db(s.carrier?.dbm)} dBm. The flattening curve on the output plot shows it. The same limit creates the third-order products you just measured.`,
    },
    {
      title: 'Two tones compress sooner', show: ['twoTone', 'mP1', 'mP1Two', 'slope'], set: { twoTone: true, rfDbm: -5 }, span: 'near',
      text: ({ slope }) => `Two tones add and subtract as they drift in and out of phase, so their combined peaks reach the device’s limit earlier than one steady tone. ${slope?.p1dB && slope?.p1dBTwoTone ? `Here P1dB is ${db(slope.p1dB.pin)} dBm with one tone and ${db(slope.p1dBTwoTone.pin)} dBm per tone with two, ${(slope.p1dB.pin - slope.p1dBTwoTone.pin).toFixed(1)} dB lower. The total input at that point is ${db(slope.p1dBTwoTone.pin + 3)} dBm.` : slope ? 'This test point has no compression to measure. Click the last test point to see both markers.' : 'The slope plot marks both compression points once it finishes measuring.'} For a device with a cubic limit, the per-tone figure sits about 4.8 dB below the one-tone P1dB.`,
    },
    {
      title: 'High-side LO flips the spectrum', show: ['loMHz', 'product', 'unevenTones', 'chain:input', 'chain:last', 'mSense'], set: { twoTone: true, unevenTones: true, loMHz: 2300, product: 'loMinusRf', rfDbm: -20 }, span: 'near',
      see: { href: '/troubleshoot/?lesson=5', text: 'Practice this fault: Field Troubleshooter' },
      text: ({ r, s }) => `With the LO above the RF, IF = LO − RF, so a higher RF gives a lower IF. F2 is now 6 dB weaker to make this visible. At the input the strong tone is on the left, and at the output it is on the right, at ${mhz((s.carrier?.hz ?? 0) / 1e6)}. Click the first and last test points to compare them. Modems need to know this, because inverted carriers will not lock without the matching setting.`,
    },
  ],
  groundUp: [
    {
      title: 'Up to Ku-band', show: ['chainBox', 'mCarrier', 'mGain'], set: {}, span: 'near',
      text: ({ r, s, node }) => `The modem’s ${mhz(r.params.rfMHz)} carrier leaves the HPA near ${mhz(r.wantedMHz)} at ${db(s.carrier?.dbm)} dBm per tone, ${db(node.gainDb)} dB of total gain. Click any block to probe the signal at that point.`,
    },
    {
      title: 'Why the Tx filter is there', show: ['filtersOn', 'chain:rfFilter', 'specBox', 'mWorst'], set: { filtersOn: false }, span: 'all',
      text: ({ r, s }) => `Without the band filter, the HPA also amplifies the LO and the unwanted sideband near ${mhz(Math.abs(r.params.loMHz - r.params.rfMHz))}. The worst unwanted product is ${s.worst?.label ?? 'none'} at ${db(s.worstDbc)} dBc, which would radiate out of band and waste HPA power.`,
    },
    {
      title: 'Overdrive the HPA', show: ['rfDbm', 'chain:hpa', 'mIm3'], set: { filtersOn: true, rfDbm: -15 }, span: 'near',
      text: ({ s }) => `Pushing the modem level 15 dB harder drives both the BUC mixer and the HPA toward compression. Third-order products are now ${db(s.im3Dbc)} dBc. These land in neighboring channels, so uplink power is limited by linearity, not just by the HPA’s rating.`,
    },
    {
      title: 'A high-side upconverter', show: ['loMHz', 'product', 'mSense'], set: { rfDbm: -30, unevenTones: true, loMHz: 15450, product: 'loMinusRf' }, span: 'near',
      text: ({ r, s }) => `Upconversion is not always LO + IF. With a ${mhz(r.params.loMHz)} LO, LO − IF also reaches ${mhz(r.wantedMHz)}, at ${db(s.carrier?.dbm)} dBm. This output is spectrally inverted, so the modem or receiver must be set to match. Both plans are valid, and the choice usually comes down to LO availability and where the unwanted products fall.`,
    },
  ],
  satRx: [
    {
      title: 'A very weak arrival', show: ['rfDbm', 'loMHz', 'mCarrier', 'mNf'], set: {}, span: 'near',
      text: ({ r, node, s }) => `The uplink arrives at ${db(r.params.rfDbm)} dBm per tone. After the LNA, a ${mhz(r.params.loMHz)} LO shifts it to ${mhz(r.wantedMHz)}, leaving at ${db(s.carrier?.dbm)} dBm. The chain’s noise figure is ${node.nfDb.toFixed(2)} dB, set almost entirely by the first stages.`,
    },
    {
      title: 'Image on the satellite', show: ['filtersOn', 'imageOn', 'imageDbm', 'planBox', 'mNf'], set: { filtersOn: false, imageOn: true, imageDbm: -80 }, span: 'near',
      text: ({ r, s, node }) => `Energy near ${mhz(r.imageMHz)} reaches the same channel through Image + LO, here at ${db(s.imageDbc)} dBc. With the filters out, the LNA’s amplified noise at that frequency also converts onto your carrier, so the noise figure is now ${node.nfDb.toFixed(2)} dB.`,
    },
    {
      title: 'Filters restored', show: ['filtersOn', 'chain:imageFilter', 'mNf'], set: { filtersOn: true, imageOn: true, imageDbm: -80 }, span: 'near',
      text: ({ s, node }) => `With the filters in, the image contribution ${s.imageDbc === null ? 'falls below anything this model tracks' : `drops to ${db(s.imageDbc)} dBc`} and the noise figure recovers to ${node.nfDb.toFixed(2)} dB. The image filter sits after the LNA because a filter before it could not remove the noise the LNA adds itself.`,
    },
    {
      title: 'Another translation plan', show: ['loMHz', 'product', 'mSense'], set: { imageOn: false, loMHz: 26750, product: 'loMinusRf' }, span: 'near',
      text: ({ r }) => `Satellites do not all translate with F − LO. Here a ${mhz(r.params.loMHz)} LO gives LO − F = ${mhz(r.wantedMHz)}, the same downlink from a different plan. Because the LO is above the input, the transponder inverts the spectrum. A ground station must account for that when it sets its carrier frequency and spectral sense.`,
    },
  ],
  satTx: [
    {
      title: 'What a TWTA is', show: ['chain:twta'], set: {}, span: 'near',
      text: () => 'A traveling-wave tube amplifier (TWTA) is the satellite’s final power stage. An electron beam runs along a helix, and the RF wave on that helix takes energy from the beam. The beam’s DC power limits how much RF the tube can produce. That maximum is called saturation. Click the TWTA block to probe its output. This scene starts at a higher level than Satellite receive ended, because driver stages between them, not drawn here, add gain.',
    },
    {
      title: 'Operating with backoff', show: ['mIbo', 'mObo', 'mIm3'], set: {}, span: 'near',
      text: ({ r, s }) => `Backoff means deliberately running below saturation. Input backoff (IBO) measures it at the tube’s input, and output backoff (OBO) at its output. ${backoffText(r)}. ${amplifierBackoff(r, 'twta').iboDb > 3 ? 'The amplifier is more linear there, so it adds less distortion.' : 'At this drive it has little or no backoff left, so distortion is high.'} Each tone leaves at ${db(s.carrier?.dbm)} dBm, and third-order products are ${db(s.im3Dbc)} dBc. Both this scene and later labs use typical tube models rather than measured ones, and across normal backoff they can differ by up to about 7 dB in C/IM and 1.4 dB in OBO.`,
    },
    {
      title: 'Into saturation', show: ['rfDbm', 'mIbo', 'mObo', 'mIm3', 'slope'], set: { rfDbm: -35 }, span: 'near',
      see: { href: '/interference/?lesson=11', text: 'See what this does to shared carriers: Power robbing' },
      text: ({ r, s }) => `${amplifierBackoff(r, 'twta').iboDb > 3 ? `${backoffText(r)}, so at this level it is below its ceiling. Each tone is ${db(s.carrier?.dbm)} dBm, and third-order products are ${db(s.im3Dbc)} dBc.` : `Adding 17 dB of drive gives far less than 17 dB more output, because the tube is running out of beam power. ${backoffText(r)}, so it is at its ceiling. Each tone is now ${db(s.carrier?.dbm)} dBm, and third-order products have climbed to ${db(s.im3Dbc)} dBc.`} This is why multi-carrier transponders run with backoff. Both this scene and later labs use typical tube models rather than measured ones, and across normal backoff they can differ by up to about 7 dB in C/IM and 1.4 dB in OBO.`,
    },
    {
      title: 'Backing off', show: ['rfDbm', 'mIbo', 'mObo', 'mIm3'], set: { rfDbm: -62 }, span: 'near',
      text: ({ r, s }) => `Backing the input off gives up output power, now ${db(s.carrier?.dbm)} dBm per tone, but third-order products fall to ${db(s.im3Dbc)} dBc. ${backoffText(r)}. Operators choose this tradeoff for each transponder.`,
    },
  ],
  groundDown: [
    {
      title: 'Inside an LNB', show: ['chainBox', 'mCarrier', 'mNf'], set: {}, span: 'all',
      text: ({ r, node, s }) => `After the long trip from the satellite, the signal reaches the feed extremely weak. The LNB turns a ${db(r.params.rfDbm)} dBm Ku-band carrier into ${db(s.carrier?.dbm)} dBm at ${mhz(r.wantedMHz)}, using a ${mhz(r.params.loMHz)} LO. Its ${node.nfDb.toFixed(2)} dB noise figure is nearly all the LNA’s, because its high gain hides the noise of later stages.`,
    },
    {
      title: 'Remove the image filter', show: ['filtersOn', 'chain:imageFilter', 'specBox'], set: { filtersOn: false }, span: 'near',
      text: ({ r, s }) => `A strong signal at ${mhz(r.imageMHz)} now converts directly onto your IF at ${db(s.imageDbc)} dBc. On a spectrum analyzer this looks like interference appearing from nowhere, even though the signal is nowhere near your carrier’s frequency.`,
    },
    {
      title: 'Restore the image filter', show: ['filtersOn', 'chain:imageFilter'], set: { filtersOn: true }, span: 'near',
      text: ({ s }) => `With the filter back between the LNA and mixer, the image falls to ${db(s.imageDbc)} dBc. A filter after the mixer could not do this, because by then the image and the carrier share one frequency.`,
    },
    {
      title: 'A high-side C-band LNB', show: ['rfMHz', 'loMHz', 'product', 'unevenTones', 'planBox', 'mSense'], set: { twoTone: true, unevenTones: true, imageOn: false, rfMHz: 3950, loMHz: 5150, product: 'loMinusRf', filters: { imageFilter: { centerMHz: 3950, bwMHz: 1000 } } }, span: 'near',
      text: ({ r, s }) => `A common C-band LNB places its ${mhz(r.params.loMHz)} LO above the 3.7 to 4.2 GHz band. LO − RF puts a ${mhz(r.params.rfMHz)} carrier at ${mhz(r.wantedMHz)}, at ${db(s.carrier?.dbm)} dBm. The image is now at ${mhz(r.imageMHz)}, above the LO, and the IF is inverted, so the modem’s spectral sense has to match.`,
    },
  ],
};
