// Guided walkthrough. Each step sets the overlay level, then explains the live receiver.
import { DEMOD_ACQUIRE_DB, DEMOD_HOLD_DB } from './model.js';

const n = (v) => (Number.isFinite(v) ? v.toFixed(1).replace('-', '−') : '–');
const versus = (es, need) => `${Math.abs(es - need).toFixed(1)} dB ${es >= need ? 'above' : 'below'} the ${n(need)} dB needed`;
const relative = (p) => (p.ratioDb === 0 ? 'at the same power as the carrier' : `${Math.abs(p.ratioDb).toFixed(1)} dB ${p.ratioDb < 0 ? 'below' : 'above'} the carrier`);
const decoding = (rx) => ['locked', 'degraded', 'fecLock'].includes(rx.state);

function stateLine(rx) {
  if (rx.state === 'fecFail') return 'The demodulator is still tracking frames, but FEC cannot repair the errors, so no usable picture is coming through.';
  if (decoding(rx)) return 'FEC is correcting every error, so the picture stays usable.';
  return 'The receiver has no decoded stream at this setting.';
}

// Shown during the ramp, when the walkthrough step no longer describes the screen.
export function rampCaption(rx, authOn) {
  const onOverlay = rx.source === 'overlay';
  if (rx.state === 'locked' || rx.state === 'degraded') {
    if (onOverlay) return authOn ? 'The receiver is decoding the stronger signal, but its content failed authentication, so nothing is displayed. Viewers are still off air.' : 'Captured. The IQ plot is sharp again, but around the other signal, and the injected picture is on screen.';
    return rx.state === 'locked' ? 'The receiver is following the carrier. Any second signal spreads the IQ dots, but FEC still corrects every error, so the picture stays clean.' : 'Under 1 dB of margin. The picture is still clean, but there is almost nothing left.';
  }
  return {
    fecFail: 'The demodulator is tracking frame headers, but there are more errors than FEC can correct. The picture breaks up, freezes, then goes blank. This is the state technicians call “demod locked, FEC failing”.',
    lost: 'Interference is now too strong for the demodulator to hold the frame headers and phase. Without a phase reference every point spins around the center, so the constellation smears into one large ring. A tone, by contrast, draws a small ring around each point.',
    searching: 'The receiver is searching for frame headers it can lock to, and there is no decoded picture.',
    frameSync: 'The receiver found frame headers. Until FEC decodes the stream, it cannot tell whose signal this is.',
    carrierLock: 'Carrier frequency and phase are recovered, so the constellation snaps back into points.',
    fecLock: 'FEC is correcting the stream, so its service information can finally be read.',
  }[rx.state];
}

export const LESSONS = [
  {
    title: 'A healthy broadcast', show: ['chainBox', 'esCarrier', 'esNeed', 'iq', 'decoded'], set: { overlayOn: false, ratioDb: -25, authOn: false },
    text: ({ l, rx }) => `Follow the chain from left to right: video is compressed, packed into frames, protected with error correction, mapped to symbols and sent through the satellite. The receiver reverses each step. This lab sets C/N directly, so its numbers differ from the worked carrier in Link Budget Lab. Es/(N+I), the symbol energy against noise plus interference, is ${n(l.carrierEs)} dB and this MODCOD needs ${n(l.need)} dB. ${decoding(rx) ? 'The picture is clean and the IQ points are tight.' : 'This setting is below what the MODCOD needs, so raise C/N or pick a more robust MODCOD.'} Click any block to see what it does.`,
  },
  {
    title: 'What the IQ plot shows', show: ['iq', 'modcod'], set: { overlayOn: false, ratioDb: -25 },
    text: ({ p }) => `Each dot is one received symbol, and each white cross is a position ${p.modcod} is allowed to send. The demodulator decides which cross each dot belongs to. Noise spreads the dots. Forward error correction (FEC) repairs the wrong decisions, until there are too many to repair.`,
  },
  {
    title: 'A second signal appears', show: ['overlayOn', 'ratioDb', 'esCarrier', 'esNeed', 'iq'], set: { overlayOn: true, ratioDb: -15 },
    see: { href: '/interference/?lesson=2', text: 'Review how interference adds to noise: Interference Lab' },
    text: ({ l, p, rx }) => `A second uplink shares the same frequency, ${relative(p)}. To the receiver it is added interference. Es/(N+I) is ${n(l.carrierEs)} dB, ${versus(l.carrierEs, l.need)}. ${stateLine(rx)} ${decoding(rx) ? 'The IQ plot warns you before the video does.' : ''} The second signal is modulated and runs on its own symbol clock, so the receiver catches it between its symbols at a different size every time. That spreads each point into a round cloud, just like noise. A CW tone keeps one size and only turns, which is why it draws a ring around each point instead.`.replace(/ {2,}/g, ' '),
  },
  {
    title: 'Near the cliff', show: ['ratioDb', 'esCarrier', 'decoded'], set: { overlayOn: true, ratioDb: -8 },
    text: ({ l, p, rx }) => `The second signal is ${relative(p)}. Es/(N+I) is ${n(l.carrierEs)} dB, ${versus(l.carrierEs, l.need)}. ${decoding(rx) ? 'The picture is still perfect, because coded links show almost no errors until they reach threshold. Then they fail within a few tenths of a dB.' : 'This setting is already past the limit, so the picture has failed.'}`,
  },
  {
    title: 'Demod locked, FEC failing', show: ['rxState', 'esCarrier', 'mer', 'iq'], set: { overlayOn: true, ratioDb: -6.5 },
    see: { href: '/troubleshoot/?lesson=6', text: 'Practice this fault: Field Troubleshooter' },
    text: ({ l, rx }) => `Es/(N+I) is now ${n(l.carrierEs)} dB, ${versus(l.carrierEs, l.need)}. ${rx.state === 'fecFail' ? 'Each frame starts with a PLHEADER sent in very robust modulation, so the demodulator keeps tracking even when the points overlap. There are more symbol errors than FEC can repair, and the picture breaks up. MER measured from the nearest point can read too high here, because a badly displaced symbol is scored against the wrong point. On a real receiver this split says RF is present and the problem is signal quality.' : `The receiver is not in that state at this setting. It is ${decoding(rx) ? 'still decoding' : 'not tracking the signal'}. Try 8PSK 2/3 at 16 dB C/N to see it.`}`,
  },
  {
    title: 'Service died, but the level barely moved', show: ['ratioDb', 'monLevel', 'monMer'], set: { overlayOn: true, ratioDb: -6.5 },
    text: ({ l, p, rx }) => `Total transponder output is up ${n(l.totalDb)} dB, ${l.totalDb < 1 ? 'too little for a level meter to alarm' : 'enough to trip the level alarm at this setting'}. The second signal is ${relative(p)}. Power adds, and the TWTA compresses what is added, so the total hardly changes. ${decoding(rx) ? 'This MODCOD is still holding.' : `That is enough to take this service down. The picture broke up, froze, then went blank, because FEC decodes nothing. The receiver still reports ${rx.state === 'fecFail' ? 'demod locked, FEC failing' : 'its state'}, not Lost: the RF is there and the demodulator still follows the frame headers, but none of it is usable.`} Levels show how much power is present. Es/(N+I) and MER show how usable it is, so a monitor must watch both.`,
  },
  {
    title: 'Neither signal decodes', show: ['esCarrier', 'esOverlay', 'iq'], set: { overlayOn: true, ratioDb: 0 },
    text: ({ l, rx }) => `Near equal power, each signal is the other’s interference. Carrier Es/(N+I) is ${n(l.carrierEs)} dB and overlay Es/(N+I) is ${n(l.overlayEs)} dB, against ${n(l.need)} dB needed. ${decoding(rx) ? 'This robust setting still decodes one of them.' : rx.state === 'fecFail' ? `FEC cannot decode either signal, so the screen is blank. The receiver still says demod locked, FEC failing rather than Lost, because each frame header is sent in a very robust form that survives down to about ${n(DEMOD_HOLD_DB)} dB in this model. The demodulator keeps its place in the frames even though their contents are unreadable. A receiver switched on now would lock to the headers too, so this is not hysteresis yet. Step 9 shows where history matters.` : 'The demodulator has lost its phase reference, so the whole constellation spins into one large ring. That is different from a tone, which draws a small ring around each point.'} On the IQ plot the overlap is a shapeless cloud, the same as heavy noise, so do not wait for a neat pattern before suspecting interference.`,
  },
  {
    title: 'Capture', show: ['esOverlay', 'rxState', 'rxSource', 'iq', 'decoded'], set: { overlayOn: true, ratioDb: 10 },
    text: ({ l, p, rx }) => !p.overlayOn ? 'The second signal is switched off, so there is nothing to capture the receiver. Turn it on to continue.' : `The second signal now has Es/(N+I) of ${n(l.overlayEs)} dB. ${rx.source === 'overlay' && decoding(rx) ? 'The receiver acquired it: frame sync, carrier lock, then FEC lock. The IQ plot sharpens around the other signal and the screen shows the injected picture. The receiver is working as designed, because DVB-S2 alone does not prove who sent a valid signal.' : rx.source === 'overlay' ? `The receiver tracks its headers, but the signal is below the ${n(l.need)} dB FEC needs, so the outcome is denied service.` : 'The receiver is not decoding it.'} A receiver only follows a signal compatible with its configuration, so most strong co-channel interference simply denies service.`,
  },
  {
    title: 'Why the demod stays on it', show: ['rxSource', 'esCarrier', 'esOverlay', 'history'], set: { overlayOn: true, ratioDb: -2.5 }, only: { modcod: '8PSK 2/3', cnDb: 16 }, peakDb: 12,
    see: { href: '/interference/?lesson=6', text: 'See what reacquisition time costs: Interference Lab' },
    text: ({ l, p, rx }) => {
      const es = rx.source === 'overlay' ? l.overlayEs : rx.source === 'carrier' ? l.carrierEs : -Infinity;
      const limits = `Keeping demod lock takes ${n(DEMOD_HOLD_DB)} dB in this model, but acquiring a signal takes ${n(DEMOD_ACQUIRE_DB)} dB.`;
      if (rx.source === 'overlay' && es >= DEMOD_HOLD_DB && es < DEMOD_ACQUIRE_DB) return `The overlay rose higher and has fallen back to ${relative(p)}. Its Es/(N+I) is ${n(es)} dB, and the real carrier is stronger at ${n(l.carrierEs)} dB, yet the demodulator is still following the overlay. ${limits} A receiver arriving now could not acquire the overlay and would track the carrier, though FEC would still fail until the carrier clears its threshold. This is hysteresis: the demodulator stays on the signal it has until it loses it. It does not delay FEC, which decodes any frame above threshold. Recovery lag after a real loss comes from the time to reacquire. This step loads 8PSK 2/3 at 16 dB C/N to show it.`;
      return `Hysteresis shows when a tracked signal sits between ${n(DEMOD_HOLD_DB)} and ${n(DEMOD_ACQUIRE_DB)} dB. ${limits} ${Number.isFinite(es) ? `The tracked signal is at ${n(es)} dB, outside that window.` : 'The receiver is not tracking a signal right now.'} FEC has no such memory, because each frame decodes on its own.`;
    },
  },
  {
    title: 'What monitoring sees', show: ['monLevel', 'monCarrier', 'monMer', 'monId'], set: { overlayOn: true, ratioDb: 10 },
    text: ({ l, rx }) => `Monitoring has several signatures. Total transponder output rose only ${n(l.totalDb)} dB, because the TWTA compresses, while the real carrier fell ${n(-l.carrierDb)} dB. A co-channel monitor usually sees those two as one composite, so the per-signal rows are marked as simulator truth. MER has its own alarm, and ${!decoding(rx) ? 'the service identity cannot be read' : rx.source === 'overlay' ? 'the decoded service identity no longer matches' : 'the decoded service identity still matches'}. An identity label is evidence, not proof. A carrier ID (CID) helps identify cooperating carriers, but a hostile signal will not usefully identify itself.`,
  },
  {
    title: 'Defense: authenticate content', show: ['authOn', 'monAuth', 'decoded'], set: { overlayOn: true, ratioDb: 10, authOn: true },
    text: ({ rx }) => `With content authentication on, ${!decoding(rx) ? 'nothing unauthenticated reaches the screen, and this setting has no decoded stream to check' : rx.source === 'overlay' ? 'the receiver still decodes the stronger signal, but the content fails its signature check, so the injected picture is never displayed' : 'the real carrier’s content passes its signature check and is displayed'}. This protects viewers only if the receiver rejects unsigned or invalid content. Encryption alone does not prove origin. It does not protect availability, the RF link, receivers that fail open, or compromised keys. Restoring the link still takes monitoring, geolocation, the satellite operator and regulators. Unauthorized transmission to a satellite is illegal.`,
  },
];
