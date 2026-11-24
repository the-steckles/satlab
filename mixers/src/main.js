import { LESSONS } from './lessons.js';
import { amplifierBackoff, filterEdges, filterLossAtDb, filterSettings, loForProduct, noiseFloorDbm, noiseProfile, PRODUCTS, runScene, SCENES, summarize, sweep, wantedMHz } from './model.js';
import { drawFilter, drawPlan, drawSlope, drawSpectrum, KINDS, M } from './plots.js';
import { mountSuite, parseLesson, writeLesson } from '../../lib/suite.js';

const $ = (id) => document.getElementById(id);
const suite = mountSuite('mixers', { jumps: [['lessonBox', 'Lesson'], ['chainBox', 'Chain'], ['specBox', 'Spectrum'], ['signalBox', 'Controls']] });
const S = { sceneId: 'bench', params: {}, saved: {}, filterId: null, nodeIndex: 1, span: 'all', view: null, refDbm: 0, rangeDb: 100, drag: null, rbw: 100000, lesson: 0, result: null, hoverX: null, slope: null, slopeKey: '', slopeTimer: 0 };
const NUMBERS = ['rfMHz', 'loMHz', 'spacingMHz'], RANGES = ['rfDbm', 'loDbm', 'imageDbm'], CHECKS = ['twoTone', 'unevenTones', 'imageOn', 'filtersOn', 'holdOutput'];
const dbText = (v, unit = 'dB') => (v === null || v === undefined || !Number.isFinite(v) ? '–' : `${v.toFixed(1).replace('-', '−')} ${unit}`);

function syncControls() {
  const scene = SCENES[S.sceneId], p = S.params;
  for (const id of NUMBERS) if (document.activeElement !== $(id)) $(id).value = p[id];
  for (const id of RANGES) { $(id).value = p[id]; $(`${id}Out`).textContent = dbText(p[id], 'dBm'); }
  for (const id of CHECKS) $(id).checked = !!p[id];
  $('mixerType').value = p.mixerType;
  syncProducts(scene, p);
  $('rfName').textContent = scene.inputName;
  $('loSection').hidden = !!scene.noLo;
  $('imageWrap').hidden = !!scene.noLo || !!scene.noImage;
  $('imageLevelWrap').hidden = !p.imageOn;
  $('spacingWrap').hidden = !p.twoTone;
}

// Each option shows its result, and is disabled when no positive frequency or LO exists.
function syncProducts(scene, p) {
  if (scene.noLo) return;
  const valid = p.product === 'sum' || (p.product === 'rfMinusLo' ? p.rfMHz > p.loMHz : p.loMHz > p.rfMHz);
  if (!valid && p.rfMHz !== p.loMHz) p.product = p.product === 'rfMinusLo' ? 'loMinusRf' : 'rfMinusLo';
  const out = wantedMHz(scene, p);
  for (const [id, name] of Object.entries(PRODUCTS)) {
    const option = $('product').querySelector(`[value=${id}]`);
    if (p.holdOutput) {
      const lo = loForProduct(id, p.rfMHz, out);
      option.disabled = lo === null;
      option.textContent = lo === null ? `${name} (not possible)` : `${name} (LO ${+lo.toFixed(3)})`;
    } else {
      const value = id === 'sum' ? p.rfMHz + p.loMHz : id === 'rfMinusLo' ? p.rfMHz - p.loMHz : p.loMHz - p.rfMHz;
      option.disabled = value <= 0;
      option.textContent = value <= 0 ? `${name} (negative)` : `${name} = ${+value.toFixed(3)} MHz`;
    }
  }
  $('product').value = p.product;
}

function renderPlan() {
  const r = S.result, p = r.params;
  $('planBox').hidden = !!r.scene.noLo;
  if (r.scene.noLo) return;
  const out = r.wantedMHz, side = p.rfMHz > p.loMHz ? 'above' : 'below', f = (v) => +v.toFixed(3), flip = r.inverted ? ' The LO is above the input, so this output is spectrally inverted.' : '';
  if (r.scene.noImage) {
    const other = p.product === 'sum' ? Math.abs(p.loMHz - p.rfMHz) : p.loMHz + p.rfMHz;
    drawPlan($('plan'), { rf: p.rfMHz, lo: p.loMHz, out, image: other, product: p.product, mode: 'upconvert' });
    $('planText').textContent = `The mixer makes two sidebands: the wanted one at ${f(out)} MHz and another at ${f(other)} MHz. An upconverter's input carries only the modem IF, so the concern here is the other sideband. The band filter after the mixer removes it and the LO before the HPA.${flip}`;
    return;
  }
  if (p.rfMHz === p.loMHz || (p.product === 'rfMinusLo' && p.rfMHz === 2 * p.loMHz)) {
    drawPlan($('plan'), { rf: p.rfMHz, lo: p.loMHz, out, image: r.imageMHz, product: p.product, mode: 'mirror' });
    $('planText').textContent = p.rfMHz === p.loMHz ? 'F1 equals the LO, so the difference product is at 0 MHz, which is DC. Move F1 or the LO to get a usable output.' : 'F1 is exactly twice the LO, so the image would sit at 0 MHz. There is no real signal at DC to convert, so this plan has no practical image.';
    return;
  }
  const aboveTwoLo = p.product === 'rfMinusLo' && p.rfMHz > 2 * p.loMHz;
  drawPlan($('plan'), { rf: p.rfMHz, lo: p.loMHz, out, image: r.imageMHz, product: p.product, mode: aboveTwoLo ? 'aboveTwoLo' : 'mirror' });
  const why = p.product === 'sum'
    ? `F1 + LO lands on ${f(out)} MHz. A signal at ${f(r.imageMHz)} MHz also lands there, because Image − LO gives the same result.`
    : aboveTwoLo
      ? `F1 − LO lands on ${f(out)} MHz. ${r.imageMHz === p.loMHz ? 'The image sits exactly on the LO, not the same distance from it as F1' : r.imageMHz > p.loMHz ? 'Both F1 and the image are above this low LO' : 'The image is below this LO, but not the same distance from it as F1'}, so it is not a mirror across the LO. A signal at ${f(r.imageMHz)} MHz reaches the same output through its sum product, Image + LO.`
      : `A mixer's output depends on distance from the LO. F1 is ${f(out)} MHz ${side} the LO, and the image is the same distance on the other side at ${f(r.imageMHz)} MHz, so both convert to ${f(out)} MHz.`;
  $('planText').textContent = `${why} Once mixed, they share one frequency and cannot be separated, so the image must be filtered out before the mixer.${flip}`;
}

function renderChain() {
  const box = $('chain');
  const nodes = S.result.nodes;
  if (box.children.length !== nodes.length || box.dataset.scene !== S.sceneId) {
    box.dataset.scene = S.sceneId;
    box.replaceChildren(...nodes.map((n, i) => {
      const b = document.createElement('button');
      b.append(n.name, document.createElement('small'));
      b.addEventListener('click', () => {
        S.nodeIndex = i;
        const stage = S.result.scene.stages[i - 1];
        if (stage?.type === 'filter') S.filterId = stage.id;
        render();
      });
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
  const stage = S.result.scene.stages[S.nodeIndex - 1];
  $('stageNote').textContent = stage ? `${stage.name}: ${stage.about}` : S.result.scene.intro;
}

const clampView = (centerHz, spanHz) => {
  const span = Math.min(1e11, Math.max(1e5, spanHz));
  return { centerHz: Math.min(1e11, Math.max(span / 2, centerHz)), spanHz: span };
};

const carrierHz = (side) => (side ? S.result.wantedMHz : S.result.params.rfMHz) * 1e6;
const sideOf = (index) => !!S.result.nodes[index].pastMixer;

// One window for the whole chain. "Fit all" covers every test point, so stepping through stages never moves it.
function presetView(kind) {
  const r = S.result, p = r.params, side = sideOf(S.nodeIndex);
  S.span = kind;
  if (kind === 'near') {
    const half = Math.max(5e6, (p.twoTone ? 8 : 4) * p.spacingMHz * 1e6);
    S.view = { ...clampView(carrierHz(side), 2 * half), side };
  } else {
    const top = 1.06 * Math.max(1e6, ...r.nodes.flatMap((n) => n.products.filter((x) => x.dbm > noiseFloorDbm(n, S.rbw)).map((x) => x.hz)));
    S.view = { ...clampView(top / 2, top), side };
  }
}

// Crossing the mixer moves the carrier. Retune only if it left the screen, keeping its offset from center
// (mirrored when the mixer inverts the spectrum), as an operator would.
function crossMixer(side) {
  const v = S.view, from = carrierHz(v.side), to = carrierHz(side);
  S.view = { ...v, side };
  if (Math.abs(to - v.centerHz) < v.spanHz / 2) return;
  S.view = { ...clampView(to + (S.result.inverted ? -1 : 1) * (v.centerHz - from), v.spanHz), side };
}

// One level scale for the whole chain, so a stage's gain shows as the trace rising, not the axis moving.
function autoLevel() {
  let strongest = -Infinity, lowest = Infinity;
  S.result.nodes.forEach((node, i) => {
    const floor = noiseFloorDbm(node, S.rbw);
    strongest = Math.max(strongest, Math.max(floor, noiseProfile(S.result, i, S.rbw).peakDbm) + 20, ...node.products.map((x) => x.dbm));
    lowest = Math.min(lowest, floor);
  });
  S.refDbm = Math.ceil((strongest + 8) / 10) * 10;
  S.rangeDb = Math.max(80, S.refDbm - Math.floor((lowest - 12) / 10) * 10);
}

const currentView = () => S.view;
function setView(centerHz, spanHz) {
  S.view = { ...clampView(centerHz, spanHz), side: S.view.side };
  renderSpectrum();
}

const mhzLabel = (v) => +v.toFixed(3);

function renderFilter() {
  const r = S.result, index = r.scene.stages.findIndex((x) => x.id === S.filterId), stage = r.scene.stages[index];
  const f = filterSettings(stage, r.scene, r.params), lossAt = (mhz) => filterLossAtDb(f, mhz);
  const arriving = r.nodes[index].products.flatMap((x) => x.parts).sort((a, b) => b.dbm - a.dbm);
  drawFilter($('filterPlot'), { settings: f, lossAt, list: arriving });
  $('filterPick').value = stage.id;
  if (document.activeElement !== $('filterCenter')) $('filterCenter').value = mhzLabel(f.centerMHz);
  if (document.activeElement !== $('filterBw')) $('filterBw').value = mhzLabel(f.bwMHz);
  $('filterCenter').disabled = f.tracking;
  $('filterPoles').value = f.poles; $('filterPolesOut').textContent = `${f.poles} (${f.poles * 6} dB per doubling of offset)`;
  $('filterLoss').value = f.lossDb; $('filterLossOut').textContent = dbText(f.lossDb);
  $('filterTrack').checked = f.tracking;
  $('filterEnabled').checked = f.enabled;
  $('filterEnabled').disabled = !r.params.filtersOn;
  const wanted = arriving.find((x) => x.kind === 'wanted');
  const unwanted = arriving.filter((x) => x.kind !== 'wanted').slice(0, 3).map((x) => `${x.label} at ${mhzLabel(x.hz / 1e6)} MHz: ${lossAt(x.hz / 1e6).toFixed(1)} dB`);
  const state = !r.params.filtersOn ? 'Bypassed by the Filters in circuit option. ' : !f.enabled ? 'Bypassed. ' : '';
  const miss = wanted && lossAt(wanted.hz / 1e6) > f.lossDb + 3 ? `The wanted signal is outside the passband and loses ${lossAt(wanted.hz / 1e6).toFixed(1)} dB. ` : '';
  $('filterText').textContent = `${state}${miss}3 dB passband ${mhzLabel(filterEdges(f)[0])} to ${mhzLabel(filterEdges(f)[1])} MHz. Dots are the products arriving at this filter.${unwanted.length ? ` Filter loss for the strongest unwanted products: ${unwanted.join('; ')}.` : ''}`;
}

function setFilter(change) {
  const old = S.params.filters[S.filterId] ?? {};
  S.params.filters = { ...S.params.filters, [S.filterId]: { ...old, ...change } };
  render();
}

function renderSpectrum() {
  const node = S.result.nodes[S.nodeIndex];
  const floorDbm = noiseFloorDbm(node, S.rbw), noise = noiseProfile(S.result, S.nodeIndex, S.rbw);
  const view = currentView(), loHz = view.centerHz - view.spanHz / 2, hiHz = view.centerHz + view.spanHz / 2;
  const noiseAt = (hz) => noise.at(Math.max(1e-3, hz / 1e6));
  drawSpectrum($('spectrum'), { list: node.products, loHz, hiHz, topDbm: S.refDbm, bottomDbm: S.refDbm - S.rangeDb, floorDbm, noiseAt, hoverX: S.hoverX });
  $('specTitle').textContent = `Spectrum at ${node.name}`;
  for (const [id, v] of [['specCenter', view.centerHz / 1e6], ['specSpan', view.spanHz / 1e6], ['specRef', S.refDbm], ['specRange', S.rangeDb]]) {
    if (document.activeElement !== $(id)) $(id).value = mhzLabel(v);
  }
}

function renderTable(node, s) {
  const ref = s.carrier?.dbm;
  // Products far under the noise cannot be measured, so listing them would only suggest false precision.
  const floor = noiseFloorDbm(node, S.rbw) - 20;
  const rows = node.products.flatMap((x) => x.parts).filter((x) => x.dbm >= floor).sort((a, b) => b.dbm - a.dbm).slice(0, 24).map((x) => {
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
  $('mGainActual').textContent = dbText(s.carrier ? s.carrier.dbm - S.params.rfDbm : null);
  $('mNf').textContent = dbText(node.nfDb);
  $('mSense').textContent = S.result.scene.noLo ? '–' : node.pastMixer && S.result.inverted ? 'Inverted' : 'Normal';
  $('mWorst').textContent = s.worst ? `${s.worst.label} ${dbText(s.worstDbc, 'dBc')}` : '–';
  $('mIm3').textContent = dbText(s.im3Dbc, 'dBc');
  $('mIip3').textContent = dbText(S.slope?.iip3, 'dBm');
  $('mOip3').textContent = dbText(S.slope?.oip3, 'dBm');
  $('mP1').textContent = dbText(S.slope?.p1dB?.pin, 'dBm');
  $('mP1Two').textContent = dbText(S.slope?.p1dBTwoTone?.pin, 'dBm');
  const backoff = S.sceneId === 'satTx' ? amplifierBackoff(S.result, 'twta') : null;
  $('mIbo').textContent = dbText(backoff?.iboDb);
  $('mObo').textContent = dbText(backoff?.oboDb);
}

function renderLesson(node, s) {
  const list = LESSONS[S.sceneId], lesson = list[S.lesson];
  $('lessonHead').textContent = `Guided experiment: ${SCENES[S.sceneId].name}`;
  $('lessonTitle').textContent = lesson.title;
  // Lessons describe the chain's output, so clicking another test point cannot make them false.
  const output = S.result.nodes.at(-1);
  suite.text($('lessonText'), lesson.text({ r: S.result, s: summarize(output), node: output, slope: S.slope }));
  const expected = lessonParams(S.sceneId, S.lesson);
  $('lessonChanged').hidden = Object.keys({ ...expected, ...S.params }).every((k) => k === 'filters' ? JSON.stringify(expected.filters) === JSON.stringify(S.params.filters) : !!expected[k] === !!S.params[k] && (typeof expected[k] !== 'number' || expected[k] === S.params[k]) && (typeof expected[k] !== 'string' || expected[k] === S.params[k]));
  $('lessonPos').textContent = `${S.lesson + 1} of ${list.length}`;
  $('lessonBack').disabled = S.lesson === 0;
  $('lessonNext').disabled = S.lesson === list.length - 1;
  suite.related(lesson.see, S.sceneId === 'groundDown' && S.lesson === list.length - 1);
  // "chain:<stage id>" names a test point button. The input point is first and the last stage's output is last.
  const points = $('chain').children, stages = S.result.scene.stages;
  suite.spotlight((lesson.show ?? []).map((k) => {
    if (!k.startsWith('chain:')) return k;
    const id = k.slice(6);
    const at = stages.findIndex((s) => s.id === id);
    return id === 'input' ? points[0] : id === 'last' ? points[points.length - 1] : at < 0 ? null : points[at + 1];
  }));
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
  if (!S.view) { presetView(S.span); autoLevel(); } // A new lesson or scene sets up the analyzer once.
  else if (S.view.side !== sideOf(S.nodeIndex)) crossMixer(sideOf(S.nodeIndex));
  const node = S.result.nodes[S.nodeIndex], s = summarize(node);
  syncControls();
  renderChain();
  renderPlan();
  renderSpectrum();
  renderFilter();
  renderTable(node, s);
  renderLesson(node, s);
  scheduleSlope();
  renderMeasures(node, s);
}

// Lessons build on one another, so a step's settings are the defaults plus every step up to it.
function lessonParams(sceneId, index) {
  const params = { ...SCENES[sceneId].defaults, filters: {} };
  for (let i = 0; i <= index; i++) Object.assign(params, LESSONS[sceneId][i].set);
  return params;
}

function applyLesson(index) {
  const scene = SCENES[S.sceneId], list = LESSONS[S.sceneId];
  S.lesson = index;
  S.saved[S.sceneId] = index;
  writeLesson(index, { scene: S.sceneId });
  S.params = lessonParams(S.sceneId, index);
  const lesson = list[index];
  S.span = lesson.span;
  S.view = null;
  S.nodeIndex = scene.stages.length;
  S.hoverX = null;
  render();
}

function setScene(id, lesson = S.saved[id] ?? 0) {
  S.sceneId = id;
  const filters = SCENES[id].stages.filter((x) => x.type === 'filter');
  S.filterId = filters[0].id;
  $('filterPick').replaceChildren(...filters.map((x) => new Option(x.name, x.id)));
  for (const b of $('scenes').children) {
    const on = b.dataset.scene === id;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  }
  applyLesson(lesson);
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
      const scene = SCENES[S.sceneId];
      if (id === 'rfMHz' && S.params.holdOutput && !scene.noLo) {
        const lo = loForProduct(S.params.product, v, wantedMHz(scene, S.params));
        if (lo === null) { e.target.value = S.params[id]; return; }
        S.params.loMHz = lo;
      }
      if (id === 'loMHz') S.params.holdOutput = false; // Moving the LO by hand means moving the output.
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
  $('product').append(...Object.entries(PRODUCTS).map(([id, name]) => new Option(name, id)));
  $('product').addEventListener('change', (e) => {
    const p = S.params, scene = SCENES[S.sceneId];
    if (p.holdOutput) p.loMHz = loForProduct(e.target.value, p.rfMHz, wantedMHz(scene, p));
    p.product = e.target.value;
    render();
  });
  $('filterPick').addEventListener('change', (e) => { S.filterId = e.target.value; render(); });
  for (const [id, key] of [['filterCenter', 'centerMHz'], ['filterBw', 'bwMHz']]) $(id).addEventListener('change', (e) => {
    const v = +e.target.value;
    if (e.target.value === '' || !Number.isFinite(v) || v < +e.target.min || v > +e.target.max) { render(); return; }
    setFilter({ [key]: v });
  });
  $('filterPoles').addEventListener('input', (e) => setFilter({ poles: +e.target.value }));
  $('filterLoss').addEventListener('input', (e) => setFilter({ lossDb: +e.target.value }));
  $('filterEnabled').addEventListener('change', (e) => setFilter({ on: e.target.checked }));
  $('filterTrack').addEventListener('change', (e) => {
    const stage = SCENES[S.sceneId].stages.find((x) => x.id === S.filterId);
    setFilter({ track: e.target.checked, centerMHz: e.target.checked ? undefined : filterSettings(stage, SCENES[S.sceneId], S.params).centerMHz });
  });
  $('filterReset').addEventListener('click', () => {
    // Back to this step's design, which may itself retune the filter.
    const { [S.filterId]: _removed, ...rest } = S.params.filters, design = lessonParams(S.sceneId, S.lesson).filters[S.filterId];
    S.params.filters = design ? { ...rest, [S.filterId]: design } : rest;
    render();
  });
  $('mixerType').addEventListener('change', (e) => { S.params.mixerType = e.target.value; render(); });
  $('viewAll').addEventListener('click', () => { presetView('all'); renderSpectrum(); });
  $('viewNear').addEventListener('click', () => { presetView('near'); renderSpectrum(); });
  $('viewLevel').addEventListener('click', () => { autoLevel(); renderSpectrum(); });
  for (const id of ['specCenter', 'specSpan', 'specRef', 'specRange']) $(id).addEventListener('change', (e) => {
    const v = +e.target.value;
    if (e.target.value === '' || !Number.isFinite(v) || v < +e.target.min || v > +e.target.max) { renderSpectrum(); return; }
    const view = currentView();
    if (id === 'specCenter') setView(v * 1e6, view.spanHz);
    else if (id === 'specSpan') setView(view.centerHz, v * 1e6);
    else { S[id === 'specRef' ? 'refDbm' : 'rangeDb'] = v; renderSpectrum(); }
  });
  $('rbw').addEventListener('change', (e) => { S.rbw = +e.target.value; renderSpectrum(); });
  $('reset').addEventListener('click', () => applyLesson(0));
  $('lessonRestore').addEventListener('click', () => applyLesson(S.lesson));
  $('lessonBack').addEventListener('click', () => applyLesson(S.lesson - 1));
  $('lessonNext').addEventListener('click', () => applyLesson(S.lesson + 1));
  const canvas = $('spectrum');
  const plotWidth = () => canvas.getBoundingClientRect().width - M.l - M.r;
  canvas.addEventListener('pointerdown', (e) => {
    S.drag = { x: e.clientX, centerHz: currentView().centerHz, moved: false };
    S.hoverX = e.clientX - canvas.getBoundingClientRect().left;
    renderSpectrum();
  });
  canvas.addEventListener('pointermove', (e) => {
    S.hoverX = e.clientX - canvas.getBoundingClientRect().left;
    const dx = S.drag && e.buttons ? e.clientX - S.drag.x : 0;
    if (S.drag && Math.abs(dx) > 4) S.drag.moved = true; // A small wobble is still a tap for the marker.
    if (S.drag?.moved) {
      S.hoverX = null;
      canvas.setPointerCapture(e.pointerId);
      setView(S.drag.centerHz - (dx / plotWidth()) * currentView().spanHz, currentView().spanHz);
    } else renderSpectrum();
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { S.drag = null; });
  canvas.addEventListener('pointerleave', () => { if (!S.drag) { S.hoverX = null; renderSpectrum(); } });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Zoom around the frequency under the cursor, so the thing you point at stays put.
    const view = currentView(), frac = (e.clientX - canvas.getBoundingClientRect().left - M.l) / plotWidth();
    const at = view.centerHz + (Math.min(1, Math.max(0, frac)) - 0.5) * view.spanHz, span = view.spanHz * (e.deltaY > 0 ? 1.25 : 0.8);
    setView(at + (view.centerHz - at) * (span / view.spanHz), span);
  }, { passive: false });
  window.addEventListener('resize', () => { renderPlan(); renderSpectrum(); renderFilter(); drawSlope($('slope'), S.slope, S.params.rfDbm); });
}

wire();
const query = new URLSearchParams(location.search).get('scene');
const startScene = Object.hasOwn(SCENES, query ?? '') ? query : 'bench';
setScene(startScene, parseLesson(location.search, LESSONS[startScene].length));
