// What every lab shares: its place in the learning path, a glossary, lesson links and links between labs.
export const LABS = [
  { id: 'peaker', name: 'Peaker', href: '/peaker/' },
  { id: 'mixers', name: 'Mixer Lab', href: '/mixers/' },
  { id: 'linkbudget', name: 'Link Budget Lab', href: '/linkbudget/' },
  { id: 'interference', name: 'Interference Lab', href: '/interference/' },
  { id: 'dvbs2', name: 'DVB-S2 Overlay Lab', href: '/dvbs2/' },
  { id: 'troubleshoot', name: 'Field Troubleshooter', href: '/troubleshoot/' },
];

export const TERMS = {
  ALC: 'Automatic level control. A transponder mode that adjusts attenuation to hold the tube’s drive constant.',
  BCH: 'An outer error-correcting code in DVB-S2. It cleans up the few errors LDPC leaves behind.',
  'Beacon': 'A steady signal a satellite transmits so ground stations can find it and measure pointing and fade.',
  'C/I': 'Carrier power divided by interference power, in dB.',
  'C/N': 'Carrier power divided by noise power in a stated bandwidth, in dB.',
  'C/N0': 'Carrier power divided by noise density, in dB-Hz. It describes a link without assuming a bandwidth.',
  'C/(N+I)': 'Carrier power divided by noise plus interference. This is what the demodulator actually experiences.',
  dBc: 'A level in dB relative to the carrier. −30 dBc is 30 dB below it.',
  dBi: 'Antenna gain in dB relative to an ideal antenna that radiates equally in all directions.',
  'Es/N0': 'Energy per symbol divided by noise density. With matched filtering it equals C/N in the symbol-rate bandwidth.',
  'Es/(N+I)': 'Es/N0 with interference counted as noise. FEC is affected by both, even though their patterns can look different on an IQ plot.',
  BUC: 'Block upconverter. Converts the modem’s L-band transmit signal to the uplink band and amplifies it.',
  CID: 'Carrier ID. A low-level identifier added to a cooperating carrier, so an operator can tell who is transmitting it.',
  Compression: 'When an amplifier’s gain falls as its drive rises, so its output grows less than its input.',
  Constellation: 'The set of IQ positions a modulation can send. Received symbols cluster around these points.',
  CW: 'Continuous wave. An unmodulated tone, ideally a single frequency with no bandwidth.',
  dBW: 'Power in dB relative to one watt. 0 dBW is 30 dBm.',
  Hysteresis: 'When the level needed to start something is higher than the level needed to keep it going.',
  IQ: 'In-phase and quadrature. The two axes that describe a symbol’s amplitude and phase on a constellation plot.',
  'L-band': 'Roughly 950 to 2150 MHz in a receive chain. The IF range between an LNB and a modem.',
  NOC: 'Network operations center. The team that monitors a network and coordinates faults.',
  PLHEADER: 'The DVB-S2 physical-layer header. It marks each frame and carries its MODCOD in very robust modulation.',
  'Spectral inversion': 'A flipped spectrum, where higher input frequencies become lower output frequencies. A high-side LO causes it.',
  'Symbol rate': 'Symbols sent per second. It sets a carrier’s width, which is about the symbol rate at the −3 dB points.',
  Transponder: 'A satellite channel that receives a band of uplink signals, shifts them to the downlink and amplifies them together.',
  'Eb/N0': 'Energy per data bit divided by noise density. Useful for comparing MODCODs with different bit rates.',
  EIRP: 'Effective isotropic radiated power. Transmit power plus antenna gain, the strength of the beam in its pointing direction.',
  FEC: 'Forward error correction. Extra coded bits that let a receiver repair errors without a retransmission.',
  'G/T': 'Receive antenna gain divided by system noise temperature, in dB/K. The standard figure of merit for a receiver.',
  HPA: 'High-power amplifier. The final amplifier at an uplink site.',
  IBO: 'Input backoff. How far the drive into an amplifier is below the level that saturates it.',
  IF: 'Intermediate frequency. A lower frequency used between the RF and the modem, often L-band.',
  IM3: 'Third-order intermodulation. Products at 2f1 − f2 and 2f2 − f1 that land next to the carriers.',
  IP3: 'Third-order intercept. The extrapolated level where third-order products would equal the carrier.',
  LDPC: 'The inner, powerful error-correcting code in DVB-S2. It is why links fail so abruptly at threshold.',
  LNA: 'Low-noise amplifier. The first gain stage, which sets most of the receive noise figure.',
  LNB: 'Low-noise block downconverter. An LNA, filter and mixer at the feed that converts the downlink to L-band.',
  LO: 'Local oscillator. The steady signal a mixer multiplies the input by to shift its frequency.',
  MER: 'Modulation error ratio. Measured from how far received symbols sit from their nearest ideal positions, so it can read too high on a very poor signal.',
  MODCOD: 'A modulation and code rate pair, such as 8PSK 2/3. Higher ones carry more data and need a cleaner signal.',
  'Noise figure': 'How much a device degrades signal-to-noise ratio, in dB.',
  OBO: 'Output backoff. How far an amplifier’s output is below its saturated output.',
  P1dB: 'The level where gain has compressed by 1 dB.',
  QEF: 'Quasi-error-free. The DVB-S2 threshold where the stream is effectively free of errors.',
  RBW: 'Resolution bandwidth. The analyzer filter width. It sets the noise floor and how close signals can be resolved.',
  Saturation: 'The point where an amplifier’s output stops rising with more drive.',
  SFD: 'Saturated flux density. The signal strength at the satellite that drives its amplifier to full output.',
  'Side lobe': 'A weaker response of an antenna away from its main beam.',
  'Step-track': 'A tracking method that nudges the antenna and follows the strongest measured signal.',
  TWTA: 'Traveling-wave tube amplifier. The high-power output stage on many satellites.',
};

// Lesson numbers in a URL are one-based, and anything invalid falls back to the first lesson.
export function parseLesson(search, count) {
  const raw = new URLSearchParams(search).get('lesson');
  if (raw === null || !/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  return n >= 1 && n <= count ? n - 1 : 0;
}

export function writeLesson(index, extra = {}) {
  const q = new URLSearchParams(extra);
  q.set('lesson', index + 1);
  history.replaceState(null, '', `?${q}`);
}

const WORD_TERMS = new Set(['Beacon', 'Compression', 'Constellation', 'Hysteresis', 'Noise figure', 'Saturation', 'Side lobe', 'Spectral inversion', 'Step-track', 'Symbol rate', 'Transponder']);
const names = Object.keys(TERMS).flatMap((t) => (WORD_TERMS.has(t) ? [t, t.toLowerCase()] : [t])).sort((a, b) => b.length - a.length);
const PATTERN = new RegExp(`(?<![\\w/])(${names.map((t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})s?(?![\\w/])`, 'g');
const termFor = (word) => (TERMS[word] ? word : Object.keys(TERMS).find((t) => t.toLowerCase() === word));

// Splits text so the first use of each glossary term can become a link.
export function splitTerms(text) {
  const parts = [], seen = new Set();
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const term = termFor(m[1]);
    if (seen.has(term)) continue;
    seen.add(term);
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ term, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const STYLE = `
.suiteBar { display:inline-flex; flex-wrap:wrap; align-items:center; gap:4px 10px; margin-left:auto; font-size:12px; }
.suiteBar button { width:auto; margin:0; padding:3px 8px; font-size:12px; }
.suiteTerms { width:min(560px, calc(100vw - 32px)); max-height:80vh; padding:14px; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:6px; }
.suiteTerms::backdrop { background:rgba(0,0,0,.6); }
.suiteTerms h2 { margin:0; }
.suiteTerms .head { position:sticky; top:-14px; z-index:1; display:flex; justify-content:space-between; align-items:center; gap:8px; margin:-14px -14px 8px; padding:10px 14px; background:var(--panel); border-bottom:1px solid var(--line); }
.suiteTerms .head button { width:auto; margin:0; }
.suiteTerms dl { display:block; font:13px/1.45 system-ui, "Segoe UI", sans-serif; margin:0; }
.suiteTerms dt { color:var(--text); font-weight:600; margin-top:8px; }
.suiteTerms dd { color:var(--muted); margin:0; text-align:left; }
.suiteTerms dt.flash { color:var(--accent); }
.termLink { all:unset; cursor:help; text-decoration:underline dotted; text-underline-offset:2px; }
.termLink:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
.suiteJump { display:none; }
@media (max-width:720px) {
  body { padding-bottom:calc(56px + env(safe-area-inset-bottom)); }
  section { scroll-margin-top:8px; }
  .suiteBar a { display:inline-flex; align-items:center; min-height:36px; }
  .suiteJump { display:flex; gap:4px; position:fixed; z-index:20; left:0; right:0; bottom:0; padding:6px 8px calc(6px + env(safe-area-inset-bottom)); background:var(--panel); border-top:1px solid var(--line); }
  .suiteJump button { flex:1 1 0; min-width:0; width:auto; margin:0; padding:4px 2px; font-size:12px; }
}`;

// jumps: [[elementId, label]] for the phone bar, which keeps controls and their effects one tap apart.
export function mountSuite(id, { jumps = [], action = null } = {}) {
  const index = LABS.findIndex((x) => x.id === id), next = LABS[index + 1];
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  const dialog = document.createElement('dialog');
  dialog.className = 'suiteTerms';
  dialog.setAttribute('aria-label', 'Glossary');
  const head = document.createElement('div'), title = document.createElement('h2'), close = document.createElement('button');
  head.className = 'head';
  title.textContent = 'Terms';
  close.textContent = 'Close';
  close.addEventListener('click', () => dialog.close());
  head.append(title, close);
  const list = document.createElement('dl'), entries = new Map();
  for (const [term, text] of Object.entries(TERMS).sort(([a], [b]) => a.localeCompare(b))) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    entries.set(term, dt);
    dt.textContent = term;
    dd.textContent = text;
    list.append(dt, dd);
  }
  dialog.append(head, list);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);

  const bar = document.createElement('div'), place = document.createElement('span'), terms = document.createElement('button');
  bar.className = 'suiteBar';
  place.textContent = `Lab ${index + 1} of ${LABS.length}`;
  terms.textContent = 'Terms';
  terms.addEventListener('click', () => dialog.showModal());
  bar.append(place, terms);
  if (next) {
    const a = document.createElement('a');
    a.href = next.href;
    a.textContent = `Next: ${next.name}`;
    bar.append(a);
  }
  document.querySelector('header').append(bar);

  if (jumps.length) {
    const dock = document.createElement('nav');
    dock.className = 'suiteJump';
    dock.setAttribute('aria-label', 'Jump to');
    for (const [target, label] of jumps) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => document.getElementById(target).scrollIntoView({ block: 'start' }));
      dock.append(b);
    }
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.addEventListener('click', () => document.getElementById(action.id).click());
      dock.append(b);
    }
    document.body.append(dock);
  }

  const define = (term) => {
    dialog.showModal();
    for (const dt of entries.values()) dt.classList.remove('flash');
    entries.get(term).classList.add('flash');
    entries.get(term).scrollIntoView({ block: 'center' });
  };

  const lessonText = document.getElementById('lessonText');
  let line = null;
  if (lessonText) {
    line = document.createElement('p');
    line.className = 'note';
    line.hidden = true;
    lessonText.after(line);
  }
  return {
    // Writes explanatory text with the first use of each glossary term as a link.
    text(el, text) {
      if (el.textContent === text) return;
      el.replaceChildren(...splitTerms(text).map((part) => {
        if (typeof part === 'string') return part;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'termLink';
        b.textContent = part.text;
        b.title = TERMS[part.term];
        b.addEventListener('click', () => define(part.term));
        return b;
      }));
    },
    // Shows a related lesson, plus the next lab once the last lesson is reached.
    related(see, isLast) {
      if (!line) return;
      const targets = [see, isLast && next ? { href: next.href, text: `Next lab: ${next.name}` } : null].filter(Boolean);
      line.hidden = !targets.length;
      line.replaceChildren(...targets.flatMap((target, k) => {
        const a = document.createElement('a');
        a.href = target.href;
        a.textContent = target.text;
        return k ? [' · ', a] : [a];
      }));
    },
  };
}
