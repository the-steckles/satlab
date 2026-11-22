import { LESSONS } from './lessons.js';
import { noiseFloorDbm, runScene, SCENES, summarize, sweep } from './model.js';
import { drawSlope, drawSpectrum, KINDS } from './plots.js';

const $ = (id) => document.getElementById(id);
const S = { sceneId: 'bench', params: {}, nodeIndex: 1, span: 'all', rbw: 100000, lesson: 0, result: null, hoverX: null, slope: null, slopeKey: '', slopeTimer: 0 };
const NUMBERS = ['rfMHz', 'loMHz', 'spacingMHz'], RANGES = ['rfDbm', 'loDbm', 'imageDbm'], CHECKS = ['twoTone', 'imageOn', 'filtersOn'];
const dbText = (v, unit = 'dB') => (v === null || v === undefined || !Number.isFinite(v) ? '–' : `${v.toFixed(1).replace('-', '−')} ${unit}`);

function syncControls() {
  const scene = SCENES[S.sceneId], p = S.params;
  for (const id of NUMBERS) if (document.activeElement !== $(id)) $(id).value = p[id];
  for (const id of RANGES) { $(id).value = p[id]; $(`${id}Out`).textContent = dbText(p[id], 'dBm'); }
  for (const id of CHECKS) $(id).checked = p[id];
  $('mixerType').value = p.mixerType;
  $('rfName').textContent = scene.inputName;
  $('loSection').hidden = !!scene.noLo;
  $('imageWrap').hidden = !!scene.noLo || !!scene.noImage;
  $('imageLevelWrap').hidden = !p.imageOn;
  $('spacingWrap').hidden = !p.twoTone;
  $('span').value = S.span;
}

function renderChain() {
  const box = $('chain');
  const nodes = S.result.nodes;
  if (box.children.length !== nodes.length || box.dataset.scene !== S.sceneId) {
    box.dataset.scene = S.sceneId;
    box.replaceChildren(...nodes.map((n, i) => {
      const b = document.createElement('button');
      b.append(n.name, document.createElement('small'));
      b.addEventListener('click', () => { S.nodeIndex = i; render(); });
      return b;
    }));
  }
  nodes.forEach((n, i) => {
    const b = box.children[i], c = summarize(n).carrier;
    b.classList.toggle('active', i === S.nodeIndex);
    b.classList.toggle('off', !!n.bypassed);
    b.setAttribute('aria-pressed', i === S.nodeIndex);
    b.lastChild.textContent = n.bypassed ? 'bypassed' : dbText(c?.dbm, 'dBm');
  });
}

function plotRange(node, floor) {
  const r = S.result, p = r.params;
  const shown = node.products.filter((x) => x.dbm > floor);
  if (S.span === 'near') {
    const center = (node.pastMixer ? r.wantedMHz : p.rfMHz) * 1e6, half = Math.max(5e6, (p.twoTone ? 8 : 4) * p.spacingMHz * 1e6);
    return [Math.max(0, center - half), center + half];
  }
  const top = Math.max(1e6, ...shown.map((x) => x.hz));
  return [0, top * 1.06];
}

function renderSpectrum() {
  const node = S.result.nodes[S.nodeIndex];
  const floorDbm = noiseFloorDbm(node, S.rbw);
  const strongest = Math.max(floorDbm + 20, ...node.products.map((x) => x.dbm));
  const topDbm = Math.ceil((strongest + 8) / 10) * 10;
  const bottomDbm = Math.min(topDbm - 80, Math.floor((floorDbm - 12) / 10) * 10);
  const [loHz, hiHz] = plotRange(node, floorDbm);
  drawSpectrum($('spectrum'), { list: node.products, loHz, hiHz, topDbm, bottomDbm, floorDbm, hoverX: S.hoverX });
  $('specTitle').textContent = `Spectrum at ${node.name}`;
}

function renderTable(node, s) {
  const ref = s.carrier?.dbm;
  const rows = node.products.flatMap((x) => x.parts).sort((a, b) => b.dbm - a.dbm).slice(0, 24).map((x) => {
    const tr = document.createElement('tr');
    const name = document.createElement('td'), swatch = document.createElement('i');
    swatch.style.background = KINDS[x.kind].color;
    swatch.title = KINDS[x.kind].name;
    name.append(swatch, x.label);
    tr.append(name);
    for (const text of [(x.hz / 1e6).toFixed(3), x.dbm.toFixed(1).replace('-', '−'), ref === undefined ? '–' : (x.dbm - ref).toFixed(1).replace('-', '−')]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  });
  $('table').replaceChildren(...rows);
}

function renderMeasures(node, s) {
  $('mCarrier').textContent = dbText(s.carrier?.dbm, 'dBm');
  $('mGain').textContent = dbText(node.gainDb);
  $('mNf').textContent = dbText(node.nfDb);
  $('mWorst').textContent = s.worst ? `${s.worst.label} ${dbText(s.worstDbc, 'dBc')}` : '–';
  $('mIm3').textContent = dbText(s.im3Dbc, 'dBc');
  $('mIip3').textContent = dbText(S.slope?.iip3, 'dBm');
  $('mOip3').textContent = dbText(S.slope?.oip3, 'dBm');
  $('mP1').textContent = dbText(S.slope?.p1dB?.pin, 'dBm');
}

function renderLesson(node, s) {
  const list = LESSONS[S.sceneId], lesson = list[S.lesson];
  $('lessonHead').textContent = `Guided experiment: ${SCENES[S.sceneId].name}`;
  $('lessonTitle').textContent = lesson.title;
  $('lessonText').textContent = lesson.text({ r: S.result, s, node });
  $('lessonPos').textContent = `${S.lesson + 1} of ${list.length}`;
  $('lessonBack').disabled = S.lesson === 0;
  $('lessonNext').disabled = S.lesson === list.length - 1;
}

// shortcut: the sweep runs on the main thread after input settles, move it to a Web Worker if it ever causes visible lag.
function scheduleSlope() {
  const { rfDbm, imageOn, imageDbm, twoTone, ...rest } = S.params;
  const key = JSON.stringify([S.sceneId, S.nodeIndex, rest]);
  if (key === S.slopeKey) { drawSlope($('slope'), S.slope, rfDbm); return; }
  S.slopeKey = key;
  S.slope = null;
  drawSlope($('slope'), null);
  clearTimeout(S.slopeTimer);
  S.slopeTimer = setTimeout(() => {
    S.slope = sweep(S.sceneId, S.params, S.nodeIndex, 21);
    render();
  }, 180);
}

function render() {
  S.result = runScene(S.sceneId, S.params);
  S.nodeIndex = Math.min(S.nodeIndex, S.result.nodes.length - 1);
  const node = S.result.nodes[S.nodeIndex], s = summarize(node);
  syncControls();
  renderChain();
  renderSpectrum();
  renderTable(node, s);
  renderLesson(node, s);
  scheduleSlope();
  renderMeasures(node, s);
}

function applyLesson(index) {
  const scene = SCENES[S.sceneId], list = LESSONS[S.sceneId];
  S.lesson = index;
  // Lessons build on one another, so replay from the scene defaults up to this step.
  S.params = { ...scene.defaults };
  for (let i = 0; i <= index; i++) Object.assign(S.params, list[i].set);
  const lesson = list[index];
  S.span = lesson.span;
  S.nodeIndex = scene.stages.length;
  S.hoverX = null;
  render();
}

function setScene(id) {
  S.sceneId = id;
  for (const b of $('scenes').children) {
    const on = b.dataset.scene === id;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  }
  applyLesson(0);
}

function wire() {
  $('scenes').append(...Object.entries(SCENES).map(([id, scene]) => {
    const b = document.createElement('button');
    b.dataset.scene = id;
    b.textContent = scene.name;
    b.addEventListener('click', () => setScene(id));
    return b;
  }));
  $('legend').append(...Object.values(KINDS).map((k) => {
    const span = document.createElement('span'), i = document.createElement('i');
    i.style.background = k.color;
    span.append(i, k.name);
    return span;
  }));
  for (const id of NUMBERS) {
    $(id).addEventListener('change', (e) => {
      const v = +e.target.value, min = +e.target.min, max = +e.target.max;
      if (e.target.value === '' || !Number.isFinite(v) || v < min || v > max) { e.target.value = S.params[id]; return; }
      if (id === 'spacingMHz' && v / 2 >= S.params.rfMHz) { e.target.value = S.params[id]; return; }
      if (id === 'rfMHz' && S.params.twoTone && S.params.spacingMHz / 2 >= v) { e.target.value = S.params[id]; return; }
      S.params[id] = v;
      render();
    });
  }
  for (const id of RANGES) $(id).addEventListener('input', (e) => { S.params[id] = +e.target.value; render(); });
  for (const id of CHECKS) $(id).addEventListener('change', (e) => {
    S.params[id] = e.target.checked;
    if (id === 'twoTone' && e.target.checked && S.params.spacingMHz / 2 >= S.params.rfMHz) S.params.spacingMHz = S.params.rfMHz;
    render();
  });
  $('mixerType').addEventListener('change', (e) => { S.params.mixerType = e.target.value; render(); });
  $('span').addEventListener('change', (e) => { S.span = e.target.value; renderSpectrum(); });
  $('rbw').addEventListener('change', (e) => { S.rbw = +e.target.value; renderSpectrum(); });
  $('reset').addEventListener('click', () => applyLesson(0));
  $('lessonBack').addEventListener('click', () => applyLesson(S.lesson - 1));
  $('lessonNext').addEventListener('click', () => applyLesson(S.lesson + 1));
  const canvas = $('spectrum');
  for (const type of ['pointerdown', 'pointermove']) canvas.addEventListener(type, (e) => { S.hoverX = e.clientX - canvas.getBoundingClientRect().left; renderSpectrum(); });
  canvas.addEventListener('pointerleave', () => { S.hoverX = null; renderSpectrum(); });
  window.addEventListener('resize', () => { renderSpectrum(); drawSlope($('slope'), S.slope, S.params.rfDbm); });
}

wire();
setScene('bench');
