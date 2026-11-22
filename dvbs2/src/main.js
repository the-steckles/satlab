import { drawConstellation } from '../../lib/constellation.js';
import { COLORS as C, prepare, ticks, verticalLabel } from '../../lib/plot.js';
import { LESSONS, rampCaption } from './lessons.js';
import { ACQUIRE_DB, createReceiver, DEFAULTS, iqSamples, levels, MODCODS, monitor, settle, STATES, stepReceiver, videoState } from './model.js';
import { createDecoder, drawSource } from './video.js';
import { mountSuite, parseLesson, writeLesson } from '../../lib/suite.js';

const suite = mountSuite('dvbs2', { jumps: [['lessonBox', 'Lesson'], ['videoRow', 'Video'], ['controlBox', 'Controls']], action: { id: 'ramp', label: 'Ramp' } });
const $ = (id) => document.getElementById(id);
const FRAME_MS = 80, HISTORY_S = 40, RAMP_DB_PER_S = 1.5, RAMP_TOP_DB = 12, RAMP_BOTTOM_DB = -25;
const S = { p: { ...DEFAULTS }, rx: createReceiver(), lesson: 0, block: 'demod', t: 0, last: 0, paused: false, ramping: false, rampDir: 1, rampView: false, lastMer: null, shownState: '', history: [] };
const num = (v, unit = 'dB') => (Number.isFinite(v) ? `${v.toFixed(1).replace('-', '−')} ${unit}` : '–');

const BLOCKS = [
  ['source', 'tx', 'Video source', 'The program picture. Here it is a locally drawn test pattern.'],
  ['encoder', 'tx', 'Video encoder', 'Compresses the video, for example with H.264 or HEVC. Compression is why small errors can damage large areas of the picture.'],
  ['mux', 'tx', 'Transport stream', 'Combines video, audio and service information into a stream of packets, including the IDs a receiver uses to find a service.'],
  ['fec', 'tx', 'BCH + LDPC', 'Adds structured redundancy. The code rate, such as 2/3, is the fraction of bits that are real data.'],
  ['mapper', 'tx', 'Symbol mapper', 'Groups bits into symbols and places each one on the constellation. More points carry more data but need a cleaner signal.'],
  ['framing', 'tx', 'PL framing', 'Adds a physical-layer header (PLHEADER) that helps receivers find each frame and learn its MODCOD.'],
  ['shaping', 'tx', 'Pulse shaping', 'A root-raised-cosine filter limits the occupied bandwidth without making symbols interfere with one another.'],
  ['hpa', 'tx', 'Upconvert + HPA', 'Moves the signal to the uplink frequency and amplifies it for the antenna.'],
  ['sat', 'space', 'Satellite', 'A bent-pipe transponder amplifies everything in its band and shifts it to the downlink. It cannot tell one uplink from another.'],
  ['lnb', 'rx', 'Dish + LNB', 'Collects the downlink, amplifies it and converts it to L-band.'],
  ['demod', 'rx', 'Demodulator', 'Finds frames, recovers the carrier’s frequency and phase, and turns the waveform back into symbols. This is the IQ plot.'],
  ['decoder', 'rx', 'FEC decoder', 'Corrects symbol errors. It works almost perfectly above threshold and fails abruptly below it.'],
  ['demux', 'rx', 'Demux + auth', 'Selects the service from the transport stream. If enabled, it also checks that content is authentic.'],
  ['display', 'rx', 'Video decoder', 'Rebuilds the picture. Lost data shows up as blocks, freezes or a blank screen.'],
];

function blockHealth(id, zone) {
  const { state, source } = S.rx, onOverlay = source === 'overlay';
  if (zone !== 'rx' || id === 'lnb') return '';
  if (id === 'demod') return ['searching', 'lost'].includes(state) ? 'bad' : state === 'frameSync' ? 'warn' : onOverlay ? 'taken' : 'ok';
  if (id === 'decoder') return ['searching', 'lost', 'frameSync', 'carrierLock', 'fecFail'].includes(state) ? 'bad' : state === 'degraded' || state === 'fecLock' ? 'warn' : onOverlay ? 'taken' : 'ok';
  const video = videoState(S.rx, S.p);
  if (video.mode === 'blocked') return id === 'demux' ? 'bad' : 'bad';
  if (video.mode === 'none' || video.mode === 'frozen') return 'bad';
  if (video.errors > 0) return 'warn';
  return onOverlay ? 'taken' : 'ok';
}

function renderChain() {
  for (const [id, zone] of BLOCKS) {
    const b = $(`b-${id}`);
    b.dataset.health = blockHealth(id, zone);
    b.classList.toggle('active', id === S.block);
    b.setAttribute('aria-pressed', id === S.block);
  }
  const block = BLOCKS.find((x) => x[0] === S.block);
  $('blockNote').textContent = `${block[2]}: ${block[3]}`;
}

function drawHistory() {
  const { ctx, w, h } = prepare($('history'));
  const m = { l: 42, r: 10, t: 8, b: 26 }, pw = w - m.l - m.r, ph = h - m.t - m.b, top = 20, bottom = -20;
  const X = (t) => m.l + (1 - (S.t - t) / HISTORY_S) * pw, Y = (v) => m.t + ((top - Math.min(top, v)) / (top - bottom)) * ph;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const v of ticks(bottom, top, 4).values) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.fillText(`${v}`, m.l - 5, y + 4); }
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillText(`Last ${HISTORY_S} seconds`, m.l + pw / 2, h - 8);
  verticalLabel(ctx, 'Es/(N+I) (dB)', 10, m.t + ph / 2);
  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
  const need = levels(S.p).need;
  ctx.strokeStyle = C.marker; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(m.l, Y(need)); ctx.lineTo(m.l + pw, Y(need)); ctx.stroke();
  ctx.setLineDash([1, 3]);
  ctx.beginPath(); ctx.moveTo(m.l, Y(need + ACQUIRE_DB)); ctx.lineTo(m.l + pw, Y(need + ACQUIRE_DB)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  for (const [key, color] of [['mer', '#8fa3b0'], ['carrier', '#0f9c7e'], ['overlay', '#d0559a']]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    let drawing = false;
    for (const row of S.history) {
      // A value below the axis is a gap, not a flat line along the bottom.
      if (!Number.isFinite(row[key]) || row[key] < bottom) { drawing = false; continue; }
      if (drawing) ctx.lineTo(X(row.t), Y(row[key])); else ctx.moveTo(X(row.t), Y(row[key]));
      drawing = true;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function renderStatus() {
  const l = levels(S.p), m = monitor(S.p, S.rx), iq = iqSamples(S.p, S.rx);
  drawConstellation($('iq'), { samples: iq.samples, ideal: iq.ideal, color: S.rx.source === 'overlay' ? '#e27ab5' : '#4fe0c0', label: iq.tracking ? `following ${S.rx.source === 'overlay' ? 'overlay' : 'carrier'}` : 'no phase lock' });
  $('rxState').textContent = STATES[S.rx.state];
  $('rxState').dataset.health = S.rx.state === 'locked' ? (S.rx.source === 'overlay' ? 'taken' : 'ok') : S.rx.state === 'degraded' || S.rx.state === 'fecLock' ? 'warn' : 'bad';
  $('rxSource').textContent = S.rx.source === null ? 'None' : S.rx.source === 'overlay' ? 'Overlay' : 'Carrier';
  S.lastMer = iq.merDb;
  $('mer').textContent = num(iq.merDb);
  $('monMer').textContent = iq.merDb === null ? 'no lock' : `${num(iq.merDb)} (normal ${num(S.p.cnDb)})`;
  $('monCarrier').textContent = `${m.carrierChangeDb > -0.05 ? '0.0' : num(m.carrierChangeDb, '').trim()} dB`;
  $('esCarrier').textContent = num(l.carrierEs);
  $('esOverlay').textContent = S.p.overlayOn ? num(l.overlayEs) : '–';
  $('esNeed').textContent = num(l.need);
  $('monLevel').textContent = `+${l.totalDb.toFixed(1)} dB${m.levelAlarm ? ' ⚠' : ''}`;
  $('monId').textContent = `${m.serviceId}${m.idAlarm ? ' ⚠' : ''}`;
  $('monAuth').textContent = m.authResult;
  const quietOutage = l.totalDb < 1 ? ` Total level moved only +${l.totalDb.toFixed(1)} dB, so a level alarm alone would miss this.` : '';
  $('monAlert').textContent = m.idAlarm ? 'Alarm: the received service does not match. Escalate to the satellite operator.'
    : m.serviceAlarm ? `Alarm: service is down, with no decoded stream.${quietOutage}`
    : m.levelAlarm ? 'Warning: total level in the channel is above its normal value.'
    : m.lowMargin ? 'Warning: under 1 dB of margin.' : 'Normal.';
}

function renderLesson() {
  const lesson = LESSONS[S.lesson];
  S.shownState = `${S.rx.state}/${S.rx.source}`;
  $('lessonTitle').textContent = S.rampView ? 'Overlay ramp' : lesson.title;
  suite.text($('lessonText'), S.rampView ? rampCaption(S.rx, S.p.authOn) : lesson.text({ p: S.p, l: levels(S.p), rx: S.rx }));
  $('lessonPos').textContent = `${S.lesson + 1} of ${LESSONS.length}`;
  $('lessonBack').disabled = S.lesson === 0;
  $('lessonNext').disabled = S.lesson === LESSONS.length - 1;
  suite.related(S.rampView ? null : lesson.see, false);
}

function syncControls() {
  $('ratioDb').value = S.p.ratioDb;
  $('ratioDbOut').textContent = `${S.p.ratioDb > 0 ? '+' : ''}${num(S.p.ratioDb)}`;
  $('cnDb').value = S.p.cnDb;
  $('cnDbOut').textContent = num(S.p.cnDb);
  $('modcod').value = S.p.modcod;
  $('overlayOn').checked = S.p.overlayOn;
  $('authOn').checked = S.p.authOn;
  $('ratioDb').disabled = !S.p.overlayOn;
  $('ramp').textContent = S.ramping && S.rampDir > 0 ? 'Stop ramp' : 'Ramp up';
  $('ramp').setAttribute('aria-pressed', S.ramping && S.rampDir > 0);
  $('rampDown').textContent = S.ramping && S.rampDir < 0 ? 'Stop ramp' : 'Ramp down';
  $('rampDown').setAttribute('aria-pressed', S.ramping && S.rampDir < 0);
  $('pause').textContent = S.paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-pressed', S.paused);
}

const sourceCarrier = $('srcCarrier').getContext('2d'), sourceOverlay = $('srcOverlay').getContext('2d');
const decode = createDecoder($('decoded'));

function renderVideo() {
  drawSource(sourceCarrier, $('srcCarrier').width, $('srcCarrier').height, 'carrier', S.t);
  if (S.p.overlayOn) drawSource(sourceOverlay, $('srcOverlay').width, $('srcOverlay').height, 'overlay', S.t);
  else { sourceOverlay.fillStyle = '#0a0f14'; sourceOverlay.fillRect(0, 0, $('srcOverlay').width, $('srcOverlay').height); }
  decode(videoState(S.rx, S.p), S.t);
}

function renderAll() {
  syncControls();
  renderChain();
  renderStatus();
  renderLesson();
  drawHistory();
  renderVideo();
}

function applyLesson(index) {
  S.lesson = index;
  writeLesson(index);
  S.ramping = false;
  S.rampView = false;
  for (let i = 0; i <= index; i++) Object.assign(S.p, LESSONS[i].set);
  S.rx = settle(S.p, LESSONS[index].peakDb);
  renderAll();
}

// While paused the loop is idle, so a changed setting has to redraw the display itself.
function settingChanged() {
  syncControls();
  renderLesson();
  if (!S.paused) return;
  renderChain();
  renderStatus();
  drawHistory();
  renderVideo();
}

function startRamp(dir) {
  S.ramping = !(S.ramping && S.rampDir === dir);
  S.rampDir = dir;
  if (S.ramping) {
    S.rampView = true;
    S.p.overlayOn = true;
    S.paused = false;
    if (dir > 0 && S.p.ratioDb >= RAMP_TOP_DB) { S.p.ratioDb = RAMP_BOTTOM_DB; S.rx = createReceiver(); }
    if (dir < 0 && S.p.ratioDb <= RAMP_BOTTOM_DB) S.ramping = false;
  }
  syncControls();
  renderLesson();
}

function wire() {
  const zones = { tx: $('chainTx'), space: $('chainTx'), rx: $('chainRx') };
  for (const [id, zone, name] of BLOCKS) {
    const b = document.createElement('button');
    b.id = `b-${id}`;
    b.textContent = name;
    b.dataset.zone = zone;
    b.addEventListener('click', () => { S.block = id; renderChain(); });
    zones[zone].append(b);
  }
  $('modcod').append(...Object.entries(MODCODS).map(([name, v]) => new Option(`${name} (${v.toFixed(1)} dB)`, name)));
  $('ratioDb').addEventListener('input', (e) => { S.ramping = false; S.rampView = false; S.p.ratioDb = +e.target.value; settingChanged(); });
  $('cnDb').addEventListener('input', (e) => { S.p.cnDb = +e.target.value; settingChanged(); });
  $('modcod').addEventListener('change', (e) => { S.p.modcod = e.target.value; settingChanged(); });
  $('overlayOn').addEventListener('change', (e) => { S.p.overlayOn = e.target.checked; S.ramping = false; settingChanged(); });
  $('authOn').addEventListener('change', (e) => { S.p.authOn = e.target.checked; settingChanged(); });
  $('ramp').addEventListener('click', () => startRamp(1));
  $('rampDown').addEventListener('click', () => startRamp(-1));
  $('pause').addEventListener('click', () => { S.paused = !S.paused; syncControls(); });
  $('restart').addEventListener('click', () => { S.history = []; S.p = { ...DEFAULTS }; applyLesson(0); });
  $('lessonBack').addEventListener('click', () => applyLesson(S.lesson - 1));
  $('lessonNext').addEventListener('click', () => applyLesson(S.lesson + 1));
  window.addEventListener('resize', () => { drawHistory(); renderStatus(); });
}

function loop(now) {
  if (now - S.last >= FRAME_MS) {
    const dt = Math.min(0.25, (now - S.last) / 1000);
    S.last = now;
    if (!S.paused) {
      S.t += dt;
      if (S.ramping) {
        S.p.ratioDb = Math.max(RAMP_BOTTOM_DB, Math.min(RAMP_TOP_DB, Math.round((S.p.ratioDb + S.rampDir * RAMP_DB_PER_S * dt) * 100) / 100));
        if (S.p.ratioDb >= RAMP_TOP_DB || S.p.ratioDb <= RAMP_BOTTOM_DB) S.ramping = false;
      }
      S.rx = stepReceiver(S.rx, S.p, dt);
      if (`${S.rx.state}/${S.rx.source}` !== S.shownState) renderLesson();
      const l = levels(S.p);
      S.history.push({ t: S.t, carrier: l.carrierEs, overlay: l.overlayEs, mer: S.lastMer });
      while (S.history.length && S.history[0].t < S.t - HISTORY_S) S.history.shift();
      syncControls();
      renderChain();
      renderStatus();
      drawHistory();
      renderVideo();
    }
  }
  requestAnimationFrame(loop);
}

wire();
applyLesson(parseLesson(location.search, LESSONS.length));
requestAnimationFrame(loop);
