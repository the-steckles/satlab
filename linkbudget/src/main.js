import { COLORS as C, prepare, ticks, verticalLabel } from '../../lib/plot.js';
import { MODCODS } from '../../lib/modcods.js';
import { mountSuite, parseLesson, writeLesson } from '../../lib/suite.js';
import { LESSONS } from './lessons.js';
import { BACKOFF_MAX_DB, BACKOFF_MIN_DB, backoffCurve, bestModcod, budget, DEFAULTS, pointingToleranceDeg, rainMarginDb } from './model.js';

const suite = mountSuite('linkbudget', { jumps: [['lessonBox', 'Lesson'], ['ladderBox', 'Levels'], ['resultBox', 'Result'], ['controlsStart', 'Controls']] });
const $ = (id) => document.getElementById(id);
const S = { p: { ...DEFAULTS }, lesson: 0 };
const ACCENT = '#4fe0c0';
const num = (v, unit = 'dB', d = 1) => (Number.isFinite(v) ? `${v.toFixed(d).replace('-', '−')} ${unit}`.trim() : '–');

const GROUPS = [
  ['Transmit site', [['txPowerW', 'Power at the HPA', 1, 400, 1, 'W', 0], ['txDishM', 'Dish diameter', 0.6, 13, 0.1, 'm', 1], ['txLossDb', 'Waveguide loss', 0, 3, 0.1, 'dB', 1], ['txPointDeg', 'Pointing error', 0, 0.4, 0.01, '°', 2], ['txElDeg', 'Elevation', 5, 90, 1, '°', 0], ['upRainDb', 'Uplink rain', 0, 15, 0.5, 'dB', 1]]],
  ['Satellite', [['satGtDb', 'Receive G/T', -5, 10, 0.5, 'dB/K', 1], ['sfdDbWm2', 'Saturated flux density', -100, -75, 0.5, 'dBW/m²', 1], ['satEirpDbw', 'Saturated EIRP', 40, 58, 0.5, 'dBW', 1], ['otherCarriers', 'Other carriers, each at nominal level', 0, 5, 1, '', 0]]],
  ['Receive site', [['rxDishM', 'Dish diameter', 0.6, 9, 0.1, 'm', 1], ['rxTempK', 'System temperature', 50, 300, 5, 'K', 0], ['rxPointDeg', 'Pointing error', 0, 1.5, 0.01, '°', 2], ['rxElDeg', 'Elevation', 5, 90, 1, '°', 0], ['downRainDb', 'Downlink rain', 0, 15, 0.5, 'dB', 1]]],
  ['Carrier', [['rsMsps', 'Symbol rate', 1, 30, 0.5, 'Msym/s', 1]]],
];
const CONTROLS = GROUPS.flatMap(([, list]) => list);

function buildControls() {
  GROUPS.forEach(([title, list], index) => {
    const section = document.createElement('section'), h = document.createElement('h2');
    if (index === 0) section.id = 'controlsStart';
    h.textContent = title;
    section.append(h);
    for (const [id, name, min, max, step] of list) {
      const label = document.createElement('label'), out = document.createElement('output'), input = document.createElement('input');
      out.id = `${id}Out`;
      Object.assign(input, { id, type: 'range', min, max, step });
      input.addEventListener('input', () => { S.p[id] = +input.value; render(); });
      label.append(name, ' ', out, input);
      section.append(label);
    }
    if (title === 'Carrier') {
      const label = document.createElement('label'), select = document.createElement('select');
      select.id = 'modcod';
      select.append(...Object.entries(MODCODS).map(([name, v]) => new Option(`${name} (${v.toFixed(1)} dB)`, name)));
      select.addEventListener('change', () => { S.p.modcod = select.value; render(); });
      label.append('MODCOD', select);
      section.append(label);
    }
    $('controls').append(section);
  });
}

function drawLadder(b) {
  const { ctx, w, h } = prepare($('ladder'));
  const stages = [
    ['HPA', b.txPowerDbw], ['Uplink EIRP', b.eirpUpDbw], ['At satellite', b.eirpUpDbw - b.upPathDb - b.upAtmDb - b.p.upRainDb], ['Downlink EIRP', b.eirpDownDbw],
    ['At dish', b.eirpDownDbw - b.downPathDb - b.downAtmDb - b.p.downRainDb - b.rxPointLossDb], ['After antenna', b.rxCarrierDbw],
  ];
  const m = { l: 52, r: 16, t: 22, b: 40 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
  const values = [...stages.map((s) => s[1]), b.noiseInRsDbw], hi = Math.ceil(Math.max(...values) / 20 + 0.2) * 20, lo = Math.floor(Math.min(...values) / 20 - 0.2) * 20;
  const X = (i) => m.l + ((i + 0.5) / stages.length) * pw, Y = (v) => m.t + ((hi - v) / (hi - lo)) * ph;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const v of ticks(lo, hi, 6).values) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.fillText(`${v}`, m.l - 5, y + 4); }
  ctx.stroke();
  verticalLabel(ctx, 'Level (dBW)', 12, m.t + ph / 2);
  // The noise this carrier competes with only exists at the receiver.
  const nx = X(stages.length - 1);
  ctx.strokeStyle = '#d0559a';
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(nx - 22, Y(b.noiseInRsDbw)); ctx.lineTo(m.l + pw, Y(b.noiseInRsDbw)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = C.axis;
  ctx.beginPath(); ctx.moveTo(nx + 10, Y(b.rxCarrierDbw)); ctx.lineTo(nx + 10, Y(b.noiseInRsDbw)); ctx.stroke();
  ctx.strokeStyle = '#0f9c7e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  stages.forEach((s, i) => { if (i) ctx.lineTo(X(i), Y(s[1])); else ctx.moveTo(X(i), Y(s[1])); });
  ctx.stroke();
  ctx.lineWidth = 1;
  const narrow = pw / stages.length < 86, spot = LESSONS[S.lesson].show ?? [];
  stages.forEach((s, i) => {
    const named = spot.includes(`stage:${s[0]}`);
    if (named) { ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(i), Y(s[1]), 10, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#0f9c7e';
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(i), Y(s[1]), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = named ? ACCENT : C.text;
    ctx.textAlign = 'center';
    // Valley labels go under the point, clear of the two lines meeting there.
    const valley = i > 0 && i < stages.length - 1 && s[1] < stages[i - 1][1] && s[1] < stages[i + 1][1];
    ctx.fillText(s[1].toFixed(1).replace('-', '−'), X(i), Y(s[1]) + (valley ? 17 : -9) + (named ? (valley ? 5 : -5) : 0));
    ctx.fillStyle = named ? ACCENT : C.axis;
    const words = narrow ? s[0].split(' ') : [s[0]];
    words.forEach((word, row) => ctx.fillText(word, X(i), h - 25 + row * 13));
  });
  // On a phone the legend names this line, because the label would collide with the last points.
  if (!narrow) {
    ctx.fillStyle = C.text;
    ctx.textAlign = 'right';
    ctx.fillText(`noise in ${b.p.rsMsps} MHz`, m.l + pw, Y(b.noiseInRsDbw) + 14);
  }
}

function drawBackoff(b) {
  const { ctx, w, h } = prepare($('backoff'));
  const curve = backoffCurve(b.p), rows = curve.rows;
  if (!rows.length) {
    $('backoffNote').textContent = `The other carriers alone overdrive this transponder, so no backoff on this plot is reachable. This link is at ${num(b.iboDb)}.`;
    return;
  }
  const m = { l: 44, r: 14, t: 12, b: 36 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
  const hi = Math.ceil(Math.min(40, Math.max(...rows.flatMap((r) => [r.up, r.down, r.im, r.dist].filter(Number.isFinite)))) / 5) * 5;
  const lo = Math.floor(Math.max(hi - 35, Math.min(...rows.map((r) => r.esN0))) / 5) * 5;
  const X = (v) => m.l + ((v - BACKOFF_MIN_DB) / (BACKOFF_MAX_DB - BACKOFF_MIN_DB)) * pw, Y = (v) => m.t + ((hi - v) / (hi - lo)) * ph;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const v of ticks(lo, hi, 5).values) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.fillText(`${v}`, m.l - 5, y + 4); }
  ctx.textAlign = 'center';
  for (const v of ticks(BACKOFF_MIN_DB, BACKOFF_MAX_DB, Math.max(3, Math.floor(pw / 60))).values) { const x = Math.round(X(v)) + 0.5; ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.fillText(`${v}`, x, h - 21); }
  ctx.stroke();
  ctx.fillText('Input backoff (dB)', m.l + pw / 2, h - 6);
  verticalLabel(ctx, 'C/N in symbol rate (dB)', 11, m.t + ph / 2);
  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
  // Past the last reachable backoff the other carriers alone drive the tube harder, so your carrier would need no power.
  const last = rows.at(-1).iboDb;
  if (last < BACKOFF_MAX_DB - 0.5) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(X(last), m.t, m.l + pw - X(last), ph);
    ctx.fillStyle = C.axis;
    ctx.textAlign = 'left';
    ['The other carriers alone', `already drive it to ${num(last)} backoff,`, 'so you cannot back off further'].forEach((t, i) => ctx.fillText(t, X(last) + 8, m.t + 16 + i * 14));
  }
  const series = [['up', '#5f7df0', 2], ['down', '#c9780f', 2], ['im', '#d0559a', 2], ['dist', '#8a8f2a', 2], ['esN0', '#dbe5ea', 3]];
  for (const [key, color, width] of series) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (const r of rows) {
      if (!Number.isFinite(r[key])) continue;
      if (started) ctx.lineTo(X(r.iboDb), Y(r[key])); else { ctx.moveTo(X(r.iboDb), Y(r[key])); started = true; }
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.marker;
  ctx.setLineDash([4, 3]);
  const here = X(Math.max(BACKOFF_MIN_DB, Math.min(BACKOFF_MAX_DB, curve.operatingIbo))); // Pinned to the edge when off scale.
  ctx.beginPath(); ctx.moveTo(here, m.t); ctx.lineTo(here, m.t + ph); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#dbe5ea';
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 2;
  if (!curve.bestAtEdge) { ctx.beginPath(); ctx.arc(X(curve.best.iboDb), Y(curve.best.esN0), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.restore();
  const offScale = curve.operatingIbo < BACKOFF_MIN_DB || curve.operatingIbo > BACKOFF_MAX_DB ? ' That is off this plot, so the dashed line is pinned to the edge.' : '';
  const overdrive = b.overdriven ? ' The transponder is overdriven.' : '';
  $('backoffNote').textContent = `${curve.bestAtEdge ? 'The best point is outside this plot.' : `Best Es/N0 is ${num(curve.best.esN0)} at ${num(curve.best.iboDb)} input backoff.`} This link is at ${num(b.iboDb)}.${offScale}${overdrive}`;
}

function renderTable(b) {
  const rows = [
    ['Transmit power', num(b.txPowerDbw, 'dBW')], ['Waveguide loss', num(-b.p.txLossDb)], ['Transmit antenna gain', num(b.txGainDbi, 'dBi')], ['Transmit pointing loss', num(-b.txPointLossDb)],
    ['Uplink EIRP', num(b.eirpUpDbw, 'dBW'), true], ['Uplink path loss', num(-b.upPathDb)], ['Atmosphere and rain', num(-(b.upAtmDb + b.p.upRainDb))], ['Satellite G/T', num(b.p.satGtDb, 'dB/K')],
    ['Uplink C/N0', num(b.cn0UpDbHz, 'dB-Hz'), true], ['Input backoff', num(b.iboDb)], ['Output backoff', num(b.oboDb)], ['Downlink EIRP for this carrier', num(b.eirpDownDbw, 'dBW'), true], ...(b.neighborEirpDbw === null ? [] : [['Downlink EIRP, each other carrier', num(b.neighborEirpDbw, 'dBW')]]),
    ['Downlink path loss', num(-b.downPathDb)], ['Atmosphere and rain', num(-(b.downAtmDb + b.p.downRainDb))], ['Receive pointing loss', num(-b.rxPointLossDb)], ['Receive G/T', num(b.gtDbK, 'dB/K')],
    ['Downlink C/N0', num(b.cn0DownDbHz, 'dB-Hz'), true], ['Intermodulation C/IM0', num(b.cim0DbHz, 'dB-Hz')], ...(Number.isFinite(b.distortionDb) ? [['Nonlinear distortion C/D0', num(b.distortion0DbHz, 'dB-Hz')]] : []), ['Total C/N0', num(b.cn0DbHz, 'dB-Hz'), true],
  ];
  $('table').replaceChildren(...rows.map(([name, value, strong]) => {
    const tr = document.createElement('tr'), a = document.createElement('td'), v = document.createElement('td');
    a.textContent = name;
    v.textContent = value;
    if (strong) tr.className = 'strong';
    tr.append(a, v);
    return tr;
  }));
}

function renderResult(b) {
  const t = pointingToleranceDeg(b.p);
  const set = { rEs: num(b.esN0Db), rNeed: num(b.needDb), rMargin: num(b.marginDb), rCn0: num(b.cn0DbHz, 'dB-Hz'), rCn: num(b.cnOccupiedDb), rEb: num(b.ebN0Db), rMer: num(b.merDb), rRate: num(b.mbps, 'Mbit/s'), rLimit: b.limitedBy, rBest: bestModcod(b.p) ?? 'none', rRain: num(rainMarginDb(b.p)), rPoint: `${t.oneDbDeg.toFixed(2)}°` };
  for (const [id, text] of Object.entries(set)) $(id).textContent = text;
  $('rMargin').className = b.marginDb >= 1 ? 'good' : b.marginDb >= 0 ? 'warn' : 'bad';
  $('rState').textContent = b.overdriven ? 'Overdriven' : b.marginDb >= 1 ? 'Link closes' : b.marginDb >= 0 ? 'Marginal' : 'Link does not close';
  $('rState').className = b.overdriven ? 'bad' : $('rMargin').className;
}

function syncControls() {
  for (const [id, , , , , unit, d] of CONTROLS) { $(id).value = S.p[id]; $(`${id}Out`).textContent = `${(+S.p[id]).toFixed(d).replace('-', '−')}${unit ? ` ${unit}` : ''}`; }
  $('modcod').value = S.p.modcod;
}

function renderLesson(b) {
  const lesson = LESSONS[S.lesson];
  $('lessonTitle').textContent = lesson.title;
  suite.text($('lessonText'), lesson.text({ b }));
  $('lessonPos').textContent = `${S.lesson + 1} of ${LESSONS.length}`;
  $('lessonBack').disabled = S.lesson === 0;
  $('lessonNext').disabled = S.lesson === LESSONS.length - 1;
  suite.related(lesson.see, S.lesson === LESSONS.length - 1);
}

// Table rows are named by their label, and chart points ("stage:") are ringed in drawLadder instead.
const spotTargets = (keys = []) => keys.filter((k) => !k.startsWith('stage:'))
  .map((k) => (k.startsWith('row:') ? [...$('table').rows].find((tr) => tr.cells[0].textContent === k.slice(4)) : k));

function render() {
  const b = budget(S.p);
  syncControls();
  drawLadder(b);
  renderTable(b);
  drawBackoff(b);
  renderResult(b);
  renderLesson(b);
  suite.spotlight(spotTargets(LESSONS[S.lesson].show));
}

function applyLesson(index) {
  S.lesson = index;
  writeLesson(index);
  S.p = { ...DEFAULTS, ...LESSONS[index].set };
  render();
}

buildControls();
$('lessonBack').addEventListener('click', () => applyLesson(S.lesson - 1));
$('lessonNext').addEventListener('click', () => applyLesson(S.lesson + 1));
$('reset').addEventListener('click', () => applyLesson(S.lesson));
window.addEventListener('resize', render);
applyLesson(parseLesson(location.search, LESSONS.length));
