import { drawConstellation } from '../../lib/constellation.js';
import { LESSONS } from './lessons.js';
import { ANSWERS, CASES, DEFAULTS, EVIDENCE, evaluate, iqSamples, liveState, lockShare, MODCODS, spectrum, ticketSet, usableShare, VIEWS } from './model.js';
import { throughputMbps } from '../../lib/modcods.js';
import { createWaterfall, drawTrace } from './plots.js';
import { mountSuite, parseLesson, writeLesson } from '../../lib/suite.js';

const suite = mountSuite('interference', { jumps: [['lessonBox', 'Lesson'], ['siteBox', 'Sites'], ['specBox', 'Spectrum'], ['iqBox', 'IQ'], ['carrierBox', 'Controls']] });
const $ = (id) => document.getElementById(id);
const BINS = 512, TOP_DB = 40, BOTTOM_DB = -40, FRAME_MS = 90;
const fresh = () => ({ ...DEFAULTS, interferer: { ...DEFAULTS.interferer } });
const S = { mode: 'learn', params: fresh(), view: 'A', iqSite: 'A', lesson: 0, caseOrder: [], caseIndex: 0, picked: null, answered: null, scores: new Map(), ticketSets: new Map(), answers: new Map(), t: 0, paused: false, hoverX: null, last: 0, db: null, meta: null };
const sign = (v, unit) => (Math.abs(v) < 0.05 ? `0.0 ${unit}` : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} ${unit}`);
const num = (v, unit = 'dB') => (Number.isFinite(v) ? `${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−')} ${unit}` : '–');
let waterfall;

const stateClass = (state) => state.split(' ')[0]; // 'Demod locked, FEC failing' styles as Demod.

const ROWS = [
  ['Receiver', (s, name, r) => liveState(r.params, name, S.t), (s, name, r) => stateClass(liveState(r.params, name, S.t))],
  // The fourth field marks rows that would give away a Diagnose ticket.
  ['Es/N0', (s) => num(s.esn0), null, true],
  ['Margin', (s) => num(s.margin), null, true],
  ['Beacon level', (s) => sign(s.beaconDeltaDb, 'dB')],
  ['On opposite pol', (s) => (s.oppositePolDb === null ? 'not seen' : sign(s.oppositePolDb, 'dB'))],
  ['Carrier change', (s) => sign(s.carrierDeltaDb, 'dB'), null, true],
  ['Floor beside carrier', (s) => sign(s.floorDeltaDb, 'dB'), null, true],
  ['In-carrier N+I', (s) => sign(s.inCarrierDeltaDb, 'dB'), null, true],
  ['C/N uplink', (s) => num(s.cnUp), null, true],
  ['C/N downlink', (s) => num(s.cnDown), null, true],
  ['C/IM', (s) => num(s.cim), null, true],
  ['C/I', (s) => num(s.iDb), null, true],
  ['Other carrier', (s) => s.neighborState, (s) => stateClass(s.neighborState)],
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
    tr.hidden = S.mode === 'diagnose' && !!row[3] && !S.answered; // Tickets are read from the analyzer until answered.
    ['A', 'B'].forEach((site, n) => {
      const td = tr.children[n + 1];
      td.textContent = row[1](r.sites[site], site, r);
      td.className = row[2] ? row[2](r.sites[site], site, r) : '';
    });
  });
  const robbing = r.params.interferer.on && r.params.interferer.path === 'uplink' && r.robbedDb > 0.05 ? ` Interference is taking ${r.robbedDb.toFixed(1)} dB of output from each carrier.` : '';
  const swept = r.params.interferer.on && r.params.interferer.kind === 'swept' ? ` Above threshold ${Math.round(lockShare(r.params) * 100)}% of each sweep, usable about ${Math.round(usableShare(r.params) * 100)}% after relock time.` : '';
  $('tpNote').textContent = S.mode === 'diagnose' && !S.answered ? 'Exact levels stay hidden until you answer. Read this one from the analyzer.' : `Transponder output is ${num(-r.outputDb)} below saturation.${S.mode === 'diagnose' ? '' : robbing + swept}`;
}

function syncControls() {
  const p = S.params, i = p.interferer;
  for (const id of ['carrierMHz', 'neighborMHz']) { $(id).value = p[id]; $(`${id}Out`).textContent = sign(p[id], 'MHz'); }
  for (const id of ['iboDb', 'rainDb', 'mispointDb']) { $(id).value = p[id]; $(`${id}Out`).textContent = num(p[id]); }
  for (const id of ['trimDb', 'neighborTrimDb']) { $(id).value = p[id]; $(`${id}Out`).textContent = sign(p[id], 'dB'); }
  for (const id of ['rsMHz', 'neighborRsMHz']) { $(id).value = p[id]; $(`${id}Out`).textContent = `${p[id].toFixed(1)} Msym/s`; }
  $('neighborOn').checked = p.neighborOn;
  $('neighborWrap').hidden = !p.neighborOn;
  $('alc').checked = p.alc;
  $('modcod').value = p.modcod;
  $('neighborModcod').value = p.neighborModcod;
  $('rateNote').textContent = `About ${throughputMbps(p.modcod, p.rsMHz).toFixed(1)} Mbit/s at ${p.rsMHz.toFixed(1)} Msym/s, before framing overhead.`;
  $('iOn').checked = i.on;
  $('iKind').value = i.kind;
  $('iPath').value = i.path;
  $('iSource').value = i.source;
  $('iSourceWrap').hidden = S.mode !== 'sandbox';
  $('icDb').value = i.icDb; $('icDbOut').textContent = `${sign(i.icDb, 'dB')}`;
  $('offsetMHz').value = i.offsetMHz; $('offsetMHzOut').textContent = sign(i.offsetMHz, 'MHz');
  for (const id of ['narrowMHz', 'bwMHz', 'wideMHz', 'spanMHz', 'sweepWidthMHz']) { $(id).value = i[id]; $(`${id}Out`).textContent = `${i[id].toFixed(1)} MHz`; }
  if (i.sweepWidthMHz === 0) $('sweepWidthMHzOut').textContent = 'Tone (0 MHz)';
  const rate = (i.sweepShape === 'saw' ? 1 : 2) * i.spanMHz / i.sweepS;
  $('sweepS').value = i.sweepS; $('sweepSOut').textContent = `${i.sweepS.toFixed(1)} s, ${rate.toFixed(1)} MHz/s`;
  $('sweepShape').value = i.sweepShape;
  $('offsetName').textContent = i.kind === 'swept' ? 'Sweep center' : 'Center';
  $('cwNote').hidden = i.kind !== 'cw';
  $('narrowWrap').hidden = i.kind !== 'narrow';
  $('bwWrap').hidden = i.kind !== 'partial';
  $('wideWrap').hidden = i.kind !== 'barrage';
  $('sweepWrap').hidden = i.kind !== 'swept';
  const diagnosing = S.mode === 'diagnose';
  $('interfererBox').hidden = diagnosing;
  $('conditionsBox').hidden = diagnosing;
  $('powerBox').hidden = diagnosing;
  $('signatureBox').hidden = diagnosing; // It would hand over the ticket answers.
  $('txBox').hidden = S.mode !== 'sandbox';
  $('iqSite').value = S.iqSite;
  $('iboDb').closest('label').hidden = diagnosing; // Its value would give away the overdrive case.
  for (const b of $('views').children) {
    const on = b.dataset.view === S.view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  }
  for (const [id, mode] of [['modeLearn', 'learn'], ['modeDiagnose', 'diagnose'], ['modeSandbox', 'sandbox']]) {
    $(id).classList.toggle('active', S.mode === mode);
    $(id).setAttribute('aria-pressed', S.mode === mode);
  }
}

const SHARES = [['carrier', 'Your carrier', '#0f9c7e'], ['neighbor', 'Other carrier', '#5f7df0'], ['interference', 'Interference', '#d0559a'], ['noise', 'Uplink noise', '#6b7c88']];

function renderPower(r) {
  $('powerBar').replaceChildren(...SHARES.filter(([id]) => r.shares[id] > 0.002).map(([id, name, color]) => {
    const bar = document.createElement('i');
    bar.style.cssText = `flex:${r.shares[id]};background:${color}`;
    bar.title = `${name}: ${(r.shares[id] * 100).toFixed(1)}%`;
    return bar;
  }));
  $('powerBar').setAttribute('aria-label', SHARES.map(([id, name]) => `${name} ${Math.round(r.shares[id] * 100)}%`).join(', '));
  $('powerLegend').replaceChildren(...SHARES.map(([id, name, color]) => {
    const span = document.createElement('span'), dot = document.createElement('i');
    dot.style.background = color;
    span.append(dot, `${name} ${Math.round(r.shares[id] * 100)}%`);
    return span;
  }));
  $('powerNote').textContent = r.params.alc
    ? `ALC is on and applying ${r.tp.alcDb > 0 ? '+' : ''}${r.tp.alcDb.toFixed(1)} dB (range ±15 dB). It holds the tube’s drive constant, so a stronger input turns every signal down together.`
    : 'Fixed gain: the tube has a physical output limit. As it nears that limit, a stronger signal leaves less output for the others.';
}

function renderIq(r) {
  const iq = iqSamples(r, S.iqSite);
  drawConstellation($('iq'), { samples: iq.samples, ideal: iq.ideal, label: r.params.modcod });
  const site = r.sites[S.iqSite];
  const readsHigh = iq.merDb > site.esn0 + 1 ? ' MER reads high on a poor signal, because each symbol is scored against its nearest point.' : '';
  $('iqNote').textContent = S.mode === 'diagnose' && !S.answered ? `Site ${S.iqSite}: ${site.state}. White crosses are the ideal symbol positions.` : `Site ${S.iqSite}: MER ${num(iq.merDb)}, Es/N0 ${num(site.esn0)}, ${site.state}. White crosses are the ideal symbol positions.${readsHigh}`;
}

function renderLesson(r) {
  $('lessonText').setAttribute('aria-live', S.mode === 'sandbox' ? 'off' : 'polite'); // Sandbox text changes with every sweep frame.
  suite.spotlight(S.mode === 'learn' ? LESSONS[S.lesson].show : []); // Diagnose must not point at the answer.
  if (S.mode === 'sandbox') {
    const a = r.sites.A;
    $('lessonHead').textContent = 'Sandbox';
    $('lessonTitle').textContent = 'Build your own scenario';
    suite.text($('lessonText'), `Set up the transmit site, the second carrier and the interference, then watch the spectrum, IQ plot and site table respond. Your carrier needs ${num(r.need)} and has ${num(a.esn0)} at Site A, so its margin is ${num(a.margin)}.`);
    $('lessonPos').textContent = '';
    $('lessonBack').hidden = true;
    $('lessonNext').hidden = true;
    $('answers').hidden = true;
    $('evidence').hidden = true;
    suite.related(null, false);
    return;
  }
  $('lessonBack').hidden = false;
  $('lessonNext').hidden = false;
  if (S.mode === 'learn') {
    const l = LESSONS[S.lesson];
    $('lessonHead').textContent = 'Guided experiment';
    $('lessonTitle').textContent = l.title;
    suite.text($('lessonText'), l.text({ r }));
    $('lessonPos').textContent = `${S.lesson + 1} of ${LESSONS.length}`;
    $('lessonBack').disabled = S.lesson === 0;
    $('lessonNext').disabled = S.lesson === LESSONS.length - 1;
    $('answers').hidden = true;
    $('evidence').hidden = true;
    suite.related(l.see, S.lesson === LESSONS.length - 1);
    return;
  }
  suite.related(null, false);
  const c = CASES[S.caseOrder[S.caseIndex]];
  $('lessonHead').textContent = 'Diagnose it';
  $('lessonTitle').textContent = `Trouble ticket ${S.caseIndex + 1}`;
  const right = S.answered && S.answered.cause === c.answer && S.answered.evidence === c.evidence;
  suite.text($('lessonText'), S.answered ? `${right ? 'Correct, with the right evidence.' : `Not quite. This was ${ANSWERS[c.answer]}, shown by: ${EVIDENCE[c.evidence].toLowerCase()}.`} ${c.why}` : S.picked ? `You chose ${ANSWERS[S.picked]}. What did you see that shows it?` : 'A customer reports a problem. The table shows who is affected. Use the spectrum, waterfall and IQ plot at each test point to work out what it is, choose the most likely cause, then choose your evidence.');
  const scored = [...S.scores.values()];
  const score = `${scored.filter(Boolean).length} of ${CASES.length}`;
  $('lessonPos').textContent = scored.length === CASES.length ? `Set complete: ${score}` : `${S.caseIndex + 1} of ${CASES.length}, score ${scored.filter(Boolean).length}/${scored.length}`;
  $('lessonBack').disabled = S.caseIndex === 0;
  $('lessonNext').disabled = S.caseIndex === CASES.length - 1;
  $('answers').hidden = !!S.picked && !S.answered;
  $('evidence').hidden = !S.picked || !!S.answered;
  for (const b of $('answers').children) {
    b.disabled = !!S.answered;
    b.classList.toggle('right', !!S.answered && b.dataset.answer === c.answer);
    b.classList.toggle('wrong', !!S.answered && b.dataset.answer === S.answered.cause && S.answered.cause !== c.answer);
  }
}

function drawFrame(addRow) {
  const s = spectrum(S.params, S.view, S.t, BINS, 26, FRAME_MS / 1000);
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
  const carriers = [{ mhz: p.carrierMHz, width: p.rsMHz * 1.2, name: 'Yours', main: true }];
  if (p.neighborOn) carriers.push({ mhz: p.neighborMHz, width: p.neighborRsMHz * 1.2, name: 'Other', main: false });
  drawTrace($('spectrum'), { db: S.db, lowMHz: S.meta.lowMHz, highMHz: S.meta.highMHz, centerMHz: S.meta.centerMHz, topDb: TOP_DB, bottomDb: BOTTOM_DB, carriers, hoverX: S.hoverX });
  $('specTitle').textContent = `Spectrum at ${VIEWS[S.view].name}`;
}

function render() {
  const r = evaluate(S.params, S.t);
  syncControls();
  renderSites(r);
  renderLesson(r);
  renderPower(r);
  renderIq(r);
}

function applyLesson(i) {
  const l = LESSONS[i];
  S.lesson = i;
  writeLesson(i);
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
  // Going back shows the same ticket and answer, so the score always matches what is on screen.
  S.answered = S.answers.get(i) ?? null;
  S.picked = S.answered?.cause ?? null;
  const c = CASES[S.caseOrder[i]], base = fresh();
  if (!S.ticketSets.has(i)) S.ticketSets.set(i, ticketSet(c));
  const set = S.ticketSets.get(i);
  S.params = { ...base, ...set, interferer: { ...base.interferer, ...set.interferer } };
  S.view = 'A';
  S.t = 0;
  waterfall.clear();
  render();
  drawFrame(false);
}

function applySandbox() {
  S.params = fresh();
  S.params.interferer.on = true;
  S.view = 'A';
  S.t = 0;
  waterfall.clear();
  render();
  drawFrame(false);
}

function setMode(mode) {
  S.mode = mode;
  if (mode === 'learn') { applyLesson(S.lesson); return; }
  if (mode === 'sandbox') { applySandbox(); return; }
  S.scores = new Map();
  S.ticketSets = new Map();
  S.answers = new Map();
  S.caseOrder = CASES.map((_, i) => i);
  for (let i = S.caseOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [S.caseOrder[i], S.caseOrder[j]] = [S.caseOrder[j], S.caseOrder[i]];
  }
  applyCase(0);
}

function wire() {
  for (const id of ['modcod', 'neighborModcod']) $(id).append(...Object.entries(MODCODS).map(([name, v]) => new Option(`${name} (${v.toFixed(1)} dB)`, name)));
  $('neighborModcod').addEventListener('change', (e) => { S.params.neighborModcod = e.target.value; render(); });
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
    b.addEventListener('click', () => { S.picked = id; render(); });
    return b;
  }));
  $('evidence').append(...Object.entries(EVIDENCE).map(([id, text]) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', () => {
      const c = CASES[S.caseOrder[S.caseIndex]];
      S.answered = { cause: S.picked, evidence: id };
      S.answers.set(S.caseIndex, S.answered);
      if (!S.scores.has(S.caseIndex)) S.scores.set(S.caseIndex, S.picked === c.answer && id === c.evidence);
      render();
    });
    return b;
  }));
  for (const id of ['carrierMHz', 'iboDb', 'rainDb', 'mispointDb', 'rsMHz', 'trimDb', 'neighborMHz', 'neighborRsMHz', 'neighborTrimDb']) $(id).addEventListener('input', (e) => { S.params[id] = +e.target.value; render(); drawFrame(false); });
  $('modcod').addEventListener('change', (e) => { S.params.modcod = e.target.value; render(); });
  const setI = (key, value) => { S.params.interferer[key] = value; render(); drawFrame(false); };
  $('iOn').addEventListener('change', (e) => setI('on', e.target.checked));
  $('iKind').addEventListener('change', (e) => setI('kind', e.target.value));
  $('iPath').addEventListener('change', (e) => setI('path', e.target.value));
  $('iSource').addEventListener('change', (e) => setI('source', e.target.value));
  for (const key of ['icDb', 'offsetMHz', 'narrowMHz', 'bwMHz', 'wideMHz', 'spanMHz', 'sweepWidthMHz', 'sweepS']) $(key).addEventListener('input', (e) => setI(key, +e.target.value));
  $('sweepShape').addEventListener('change', (e) => setI('sweepShape', e.target.value));
  for (const id of ['neighborOn', 'alc']) $(id).addEventListener('change', (e) => { S.params[id] = e.target.checked; render(); drawFrame(false); });
  $('iqSite').addEventListener('change', (e) => { S.iqSite = e.target.value; render(); });
  $('sandboxReset').addEventListener('click', applySandbox);
  $('modeSandbox').addEventListener('click', () => setMode('sandbox'));
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
  window.addEventListener('resize', () => { paint(); renderIq(evaluate(S.params, S.t)); });
}

function loop(now) {
  if (!S.paused && now - S.last >= FRAME_MS) {
    S.t += Math.min(0.25, (now - S.last) / 1000);
    S.last = now;
    const r = evaluate(S.params, S.t);
    if (S.params.interferer.on && S.params.interferer.kind === 'swept') {
      renderSites(r);
      if (S.mode === 'sandbox') renderLesson(r);
    }
    renderIq(r);
    drawFrame(true);
  }
  requestAnimationFrame(loop);
}

buildSites();
waterfall = createWaterfall($('waterfall'), BINS);
wire();
S.lesson = parseLesson(location.search, LESSONS.length);
setMode('learn');
requestAnimationFrame(loop);
