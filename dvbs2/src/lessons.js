// Guided walkthrough. Each step sets the overlay level, then explains the live receiver.
const n = (v) => (Number.isFinite(v) ? v.toFixed(1).replace('-', '−') : '–');
const versus = (es, need) => `${Math.abs(es - need).toFixed(1)} dB ${es >= need ? 'above' : 'below'} the ${n(need)} dB needed`;

// Shown during the ramp, when the walkthrough step no longer describes the screen.
export function rampCaption(rx, authOn) {
  const onOverlay = rx.source === 'overlay';
  if (rx.state === 'locked' || rx.state === 'degraded') {
    if (onOverlay) return authOn ? 'The receiver locked to the stronger signal, but its content failed authentication, so nothing is displayed. Viewers are still off air.' : 'Captured. The IQ plot is sharp again, but around the other signal, and the injected picture is on screen.';
    return rx.state === 'locked' ? 'The second signal is rising. The IQ dots spread, but FEC still corrects every error, so the picture stays clean.' : 'Under 1 dB of margin. The picture is still clean, but there is almost nothing left.';
  }
  return {
    fecFail: 'The demodulator still tracks the carrier, but there are more errors than FEC can correct. The picture freezes and breaks up. This is the state technicians call “demod locked, FEC failing”.',
    lost: 'Interference is now too strong for the demodulator to hold the carrier’s phase, so the constellation smears into rings.',
    searching: 'The receiver is searching for any signal it can lock. Neither one is decodable, so there is no picture.',
    frameSync: 'The stronger signal is now clean enough that the receiver found its frame headers.',
    carrierLock: 'Carrier frequency and phase are recovered. The constellation snaps back into points.',
    fecLock: 'FEC is correcting the new stream, so its service information can finally be read.',
  }[rx.state];
}

export const LESSONS = [
  {
    title: 'A healthy broadcast', set: { overlayOn: false, ratioDb: -25, authOn: false },
    text: ({ l }) => `Follow the chain from left to right: video is compressed, packed into frames, protected with error correction, mapped to symbols and sent through the satellite. The receiver reverses each step. Es/(N+I), the symbol energy against noise plus interference, is ${n(l.carrierEs)} dB and this MODCOD needs ${n(l.need)} dB, so the picture is clean and the IQ points are tight. Click any block to see what it does.`,
  },
  {
    title: 'What the IQ plot shows', set: { overlayOn: false, ratioDb: -25 },
    text: ({ p }) => `Each dot is one received symbol, and each white cross is a position ${p.modcod} is allowed to send. The demodulator decides which cross each dot belongs to. Noise spreads the dots. Forward error correction (FEC) repairs the wrong decisions, until there are too many to repair.`,
  },
  {
    title: 'A second signal appears', set: { overlayOn: true, ratioDb: -15 },
    text: ({ l }) => `A second uplink now shares the same frequency, 15 dB weaker than the carrier. To the receiver it is just added interference. Es/(N+I) falls to ${n(l.carrierEs)} dB and the dots grow fuzzier. FEC still corrects everything while the link stays above threshold, so the IQ plot warns you before the video does.`,
  },
  {
    title: 'Near the cliff', set: { overlayOn: true, ratioDb: -8 },
    text: ({ l }) => `The second signal is now 8 dB below the carrier. Es/(N+I) is ${n(l.carrierEs)} dB, ${versus(l.carrierEs, l.need)}. ${l.carrierEs >= l.need ? 'The picture is still perfect, because coded links show almost no errors until they reach threshold. Then they fail within a few tenths of a dB.' : 'This MODCOD and C/N are already past the limit, so the picture has failed.'}`,
  },
  {
    title: 'Demod locked, FEC failing', set: { overlayOn: true, ratioDb: -6.5 },
    text: ({ l, rx }) => `Es/(N+I) is now ${n(l.carrierEs)} dB, ${versus(l.carrierEs, l.need)}. ${rx.state === 'fecFail' ? 'The demodulator can still follow the carrier, so the constellation keeps its shape, but there are more symbol errors than FEC can repair and the picture breaks up. On a real receiver this split is a useful clue: the RF is present and the problem is signal quality.' : 'With this MODCOD and C/N the receiver is not in the demod-locked, FEC-failing state. Try 8PSK 2/3 at 16 dB C/N to see it.'}`,
  },
  {
    title: 'Neither signal decodes', set: { overlayOn: true, ratioDb: 0 },
    text: ({ l }) => `At equal power, each signal is the other’s interference. Carrier Es/(N+I) is ${n(l.carrierEs)} dB and overlay Es/(N+I) is ${n(l.overlayEs)} dB, against ${n(l.need)} dB needed. Neither can be decoded. When the demodulator can no longer hold a phase reference, the constellation collapses into rings and the receiver starts searching.`,
  },
  {
    title: 'Capture', set: { overlayOn: true, ratioDb: 10 },
    text: ({ l, rx }) => `Now the second signal is 10 dB stronger, with Es/(N+I) of ${n(l.overlayEs)} dB. ${rx.source === 'overlay' ? 'The receiver acquires it: frame sync, carrier lock, then FEC lock. The IQ plot sharpens again, but around the other signal, and the screen shows the injected picture. The receiver is working correctly. DVB-S2 alone has no way to know who sent a valid signal.' : `That is not enough to acquire this MODCOD, which needs about ${n(l.need + 1.5)} dB, so the receiver keeps searching. Stronger interference often just denies service rather than replacing it.`}`,
  },
  {
    title: 'Why it stays captured', set: { overlayOn: true, ratioDb: 7.5 }, peakDb: 12,
    text: ({ l, rx }) => rx.source === 'overlay' ? `The overlay rose to +12 dB and has dropped back to +7.5 dB. The receiver is still following it, with Es/(N+I) at ${n(l.overlayEs)} dB. Holding a lock takes ${n(l.need)} dB, but acquiring one takes more (1.5 dB in this model), so a receiver arriving at this level could need a stronger signal to lock. This is hysteresis, and it means a link may not recover the moment conditions improve.` : `With this MODCOD and C/N the receiver did not stay on the overlay, so there is no hysteresis to see here. Try 8PSK 2/3 at 16 dB C/N. Holding a lock takes less signal than acquiring one, which means a link may not recover the moment conditions improve.`,
  },
  {
    title: 'What monitoring sees', set: { overlayOn: true, ratioDb: 10 },
    text: ({ l, rx }) => `Monitoring has several signatures: total level rose ${n(l.totalDb)} dB, MER in the decoded panel changed sharply through the event, and ${rx.source === 'overlay' ? 'the decoded service identity no longer matches' : 'the service identity cannot be read'}. Level alone is not enough: earlier, service failed while total level had risen less than 1 dB. Operators alarm on lock and MER too, and a carrier ID (CID) helps identify who is transmitting.`,
  },
  {
    title: 'Defense: authenticate content', set: { overlayOn: true, ratioDb: 10, authOn: true },
    text: () => 'With content authentication on, the receiver still locks to the stronger RF signal, because physics decides that. But the content fails its signature check, so the injected picture is never displayed. Encryption and signed streams protect what viewers see. Restoring the link itself still takes monitoring, geolocation, the satellite operator and regulators. Unauthorized transmission to a satellite is illegal.',
  },
];
