import { LESSONS } from './lessons.js';
import { ANSWERS, CASES, DEFAULTS, evaluate, lockShare, MODCODS, OCCUPIED_MHZ, spectrum, VIEWS } from './model.js';
import { createWaterfall, drawTrace } from './plots.js';

const $ = (id) => document.getElementById(id);
const BINS = 512, TOP_DB = 40, BOTTOM_DB = -40, FRAME_MS = 90;
const fresh = () => ({ ...DEFAULTS, interferer: { ...DEFAULTS.interferer } });
const S = { mode: 'learn', params: fresh(), view: 'A', lesson: 0, caseOrder: [], caseIndex: 0, answered: null, t: 0, paused: false, hoverX: null, last: 0, db: null, meta: null };
const sign = (v, unit) => (Math.abs(v) < 0.05 ? `0.0 ${unit}` : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} ${unit}`);
const num = (v, unit = 'dB') => (Number.isFinite(v) ? `${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−')} ${unit}` : '–');
let waterfall;

const ROWS = [
  ['Receiver', (s) => s.state, (s) => s.state],
  ['Es/N0', (s) => num(s.esn0)],
  ['Margin', (s) => num(s.margin)],
  ['Carrier change', (s) => sign(s.carrierDeltaDb, 'dB')],
  ['Noise floor change', (s) => sign(s.floorDeltaDb, 'dB')],
  ['Other carrier', (s) => s.neighborState, (s) => s.neighborState],
];

function buildSites() {
  $('sites').replaceChildren(...ROWS.map((row) => {
    const tr = document.createElement('tr'), th = document.createElement('td');
    th.textContent = row[0];
    tr.append(th, document.createElement('td'), document.createElement('td'));
    return tr;
  }));
}

function renderSites(r) {
  ROWS.forEach((row, i) => {
    const tr = $('sites').children[i];
    ['A', 'B'].forEach((site, n) => {
      const td = tr.children[n + 1];
      td.textContent = row[1](r.sites[site]);
      td.className = row[2] ? row[2](r.sites[site]) : '';
    });
  });
  const robbing = r.params.interferer.on && r.params.interferer.path === 'uplink' && r.robbedDb > 0.05 ? ` Interference is taking ${r.robbedDb.toFixed(1)} dB of output from each carrier.` : '';
  const swept = r.params.interferer.on && r.params.interferer.kind === 'swept' ? ` Locked ${Math.round(lockShare(r.params) * 100)}% of each sweep.` : '';
  $('tpNote').textContent = `Transponder output is ${num(-r.outputDb)} below saturation.${S.mode === 'learn' ? robbing + swept : ''}`;
}

function syncControls() {
  const p = S.params, i = p.interferer;
  for (const id of ['carrierMHz', 'iboDb', 'rainDb', 'mispointDb']) {
    $(id).value = p[id];
    $(`${id}Out`).textContent = id === 'carrierMHz' ? sign(p[id], 'MHz') : num(p[id]);
  }
  $('modcod').value = p.modcod;
  $('iOn').checked = i.on;
  $('iKind').value = i.kind;
  $('iPath').value = i.path;
  $('icDb').value = i.icDb; $('icDbOut').textContent = `${sign(i.icDb, 'dB')}`;
  $('offsetMHz').value = i.offsetMHz; $('offsetMHzOut').textContent = sign(i.offsetMHz, 'MHz');
  $('bwMHz').value = i.bwMHz; $('bwMHzOut').textContent = `${i.bwMHz.toFixed(1)} MHz`;
  $('offsetWrap').hidden = i.kind === 'barrage';
  $('bwWrap').hidden = i.kind === 'cw' || i.kind === 'barrage';
  const diagnosing = S.mode === 'diagnose';
  $('interfererBox').hidden = diagnosing;
  $('conditionsBox').hidden = diagnosing;
  $('iboDb').closest('label').hidden = diagnosing; // Its value would give away the overdrive case.
  for (const b of $('views').children) {
    const on = b.dataset.view === S.view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  }
  $('modeLearn').classList.toggle('active', !diagnosing);
  $('modeDiagnose').classList.toggle('active', diagnosing);
  $('modeLearn').setAttribute('aria-pressed', !diagnosing);
  $('modeDiagnose').setAttribute('aria-pressed', diagnosing);
}

function renderLesson(r) {
  if (S.mode === 'learn') {
    const l = LESSONS[S.lesson];
    $('lessonHead').textContent = 'Guided experiment';
    $('lessonTitle').textContent = l.title;
    $('lessonText').textContent = l.text({ r });
    $('lessonPos').textContent = `${S.lesson + 1} of ${LESSONS.length}`;
    $('lessonBack').disabled = S.lesson === 0;
    $('lessonNext').disabled = S.lesson === LESSONS.length - 1;
    $('answers').hidden = true;
    return;
  }
  const c = CASES[S.caseOrder[S.caseIndex]];
  $('lessonHead').textContent = 'Diagnose it';
  $('lessonTitle').textContent = `Trouble ticket ${S.caseIndex + 1}`;
  $('lessonText').textContent = S.answered ? `${S.answered === c.answer ? 'Correct.' : `Not quite. This was: ${ANSWERS[c.answer]}.`} ${c.why}` : 'A customer reports a problem. Compare the sites and check each test point, then choose the most likely cause.';
  $('lessonPos').textContent = `${S.caseIndex + 1} of ${CASES.length}`;
  $('lessonBack').disabled = S.caseIndex === 0;
  $('lessonNext').disabled = S.caseIndex === CASES.length - 1;
  $('answers').hidden = false;
  for (const b of $('answers').children) {
    b.disabled = !!S.answered;
    b.classList.toggle('right', !!S.answered && b.dataset.answer === c.answer);
    b.classList.toggle('wrong', !!S.answered && b.dataset.answer === S.answered && S.answered !== c.answer);
  }
}

function drawFrame(addRow) {
  const s = spectrum(S.params, S.view, S.t, BINS);
  const db = new Float64Array(BINS);
  // Four averaged power samples give the analyzer's noisy trace.
  for (let i = 0; i < BINS; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum -= Math.log(Math.max(1e-12, Math.random()));
    db[i] = s.db[i] + 10 * Math.log10(sum / 4);
  }
  S.db = db; S.meta = s;
  if (addRow) waterfall.push(db, BOTTOM_DB + 10, TOP_DB - 25);
  paint();
}

function paint() {
  if (!S.db) return;
  const p = S.params;
  const carriers = [{ mhz: p.carrierMHz, width: OCCUPIED_MHZ, name: 'Yours', main: true }, { mhz: p.neighborMHz, width: OCCUPIED_MHZ, name: 'Other', main: false }];
  drawTrace($('spectrum'), { db: S.db, lowMHz: S.meta.lowMHz, highMHz: S.meta.highMHz, centerMHz: S.meta.centerMHz, topDb: TOP_DB, bottomDb: BOTTOM_DB, carriers, hoverX: S.hoverX });
  $('specTitle').textContent = `Spectrum at ${VIEWS[S.view].name}`;
}

function render() {
  const r = evaluate(S.params, S.t);
  syncControls();
  renderSites(r);
  renderLesson(r);
}

function applyLesson(i) {
  const l = LESSONS[i];
  S.lesson = i;
  const base = fresh();
  S.params = { ...base, ...l.set, interferer: { ...base.interferer, ...l.set.interferer } };
  S.view = l.view;
  S.t = 0;
  waterfall.clear();
  render();
  drawFrame(false);
}

function applyCase(i) {
  S.caseIndex = i;
  S.answered = null;
  const c = CASES[S.caseOrder[i]], base = fresh();
  S.params = { ...base, ...c.set, interferer: { ...base.interferer, ...c.set.interferer } };
  S.view = 'A';
  S.t = 0;
  waterfall.clear();
  render();
  drawFrame(false);
}

function setMode(mode) {
  S.mode = mode;
  if (mode === 'learn') { applyLesson(S.lesson); return; }
  S.caseOrder = CASES.map((_, i) => i);
  for (let i = S.caseOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [S.caseOrder[i], S.caseOrder[j]] = [S.caseOrder[j], S.caseOrder[i]];
  }
  applyCase(0);
}

function wire() {
  $('modcod').append(...Object.entries(MODCODS).map(([name, v]) => new Option(`${name} (${v.toFixed(1)} dB)`, name)));
  $('views').append(...Object.entries(VIEWS).map(([id, v]) => {
    const b = document.createElement('button');
    b.dataset.view = id;
    b.textContent = v.name;
    b.addEventListener('click', () => { S.view = id; waterfall.clear(); syncControls(); drawFrame(false); });
    return b;
  }));
  $('answers').append(...Object.entries(ANSWERS).map(([id, text]) => {
    const b = document.createElement('button');
    b.dataset.answer = id;
    b.textContent = text;
    b.addEventListener('click', () => { S.answered = id; render(); });
    return b;
  }));
  for (const id of ['carrierMHz', 'iboDb', 'rainDb', 'mispointDb']) $(id).addEventListener('input', (e) => { S.params[id] = +e.target.value; render(); drawFrame(false); });
  $('modcod').addEventListener('change', (e) => { S.params.modcod = e.target.value; render(); });
  const setI = (key, value) => { S.params.interferer[key] = value; render(); drawFrame(false); };
  $('iOn').addEventListener('change', (e) => setI('on', e.target.checked));
  $('iKind').addEventListener('change', (e) => setI('kind', e.target.value));
  $('iPath').addEventListener('change', (e) => setI('path', e.target.value));
  for (const [id, key] of [['icDb', 'icDb'], ['offsetMHz', 'offsetMHz'], ['bwMHz', 'bwMHz']]) $(id).addEventListener('input', (e) => setI(key, +e.target.value));
  $('modeLearn').addEventListener('click', () => setMode('learn'));
  $('modeDiagnose').addEventListener('click', () => setMode('diagnose'));
  $('lessonBack').addEventListener('click', () => (S.mode === 'learn' ? applyLesson(S.lesson - 1) : applyCase(S.caseIndex - 1)));
  $('lessonNext').addEventListener('click', () => (S.mode === 'learn' ? applyLesson(S.lesson + 1) : applyCase(S.caseIndex + 1)));
  $('pause').addEventListener('click', () => {
    S.paused = !S.paused;
    $('pause').textContent = S.paused ? 'Resume' : 'Pause';
    $('pause').setAttribute('aria-pressed', S.paused);
  });
  const canvas = $('spectrum');
  for (const type of ['pointerdown', 'pointermove']) canvas.addEventListener(type, (e) => { S.hoverX = e.clientX - canvas.getBoundingClientRect().left; paint(); });
  canvas.addEventListener('pointerleave', () => { S.hoverX = null; paint(); });
  window.addEventListener('resize', paint);
}

function loop(now) {
  if (!S.paused && now - S.last >= FRAME_MS) {
    S.t += Math.min(0.25, (now - S.last) / 1000);
    S.last = now;
    if (S.params.interferer.on && S.params.interferer.kind === 'swept') renderSites(evaluate(S.params, S.t));
    drawFrame(true);
  }
  requestAnimationFrame(loop);
}

buildSites();
waterfall = createWaterfall($('waterfall'), BINS);
wire();
setMode('learn');
requestAnimationFrame(loop);
