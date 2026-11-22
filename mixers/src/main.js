import { LESSONS } from './lessons.js';
import { filterEdges, filterLossAtDb, filterSettings, loForProduct, noiseFloorDbm, PRODUCTS, runScene, SCENES, summarize, sweep, wantedMHz } from './model.js';
import { drawFilter, drawPlan, drawSlope, drawSpectrum, KINDS } from './plots.js';

const $ = (id) => document.getElementById(id);
const S = { sceneId: 'bench', params: {}, filterId: null, nodeIndex: 1, span: 'all', rbw: 100000, lesson: 0, result: null, hoverX: null, slope: null, slopeKey: '', slopeTimer: 0 };
const NUMBERS = ['rfMHz', 'loMHz', 'spacingMHz'], RANGES = ['rfDbm', 'loDbm', 'imageDbm'], CHECKS = ['twoTone', 'imageOn', 'filtersOn', 'holdOutput'];
const dbText = (v, unit = 'dB') => (v === null || v === undefined || !Number.isFinite(v) ? '–' : `${v.toFixed(1).replace('-', '−')} ${unit}`);

function syncControls() {
  const scene = SCENES[S.sceneId], p = S.params;
  for (const id of NUMBERS) if (document.activeElement !== $(id)) $(id).value = p[id];
  for (const id of RANGES) { $(id).value = p[id]; $(`${id}Out`).textContent = dbText(p[id], 'dBm'); }
  for (const id of CHECKS) $(id).checked = p[id];
  $('mixerType').value = p.mixerType;
  syncProducts(scene, p);
  $('rfName').textContent = scene.inputName;
  $('loSection').hidden = !!scene.noLo;
  $('imageWrap').hidden = !!scene.noLo || !!scene.noImage;
  $('imageLevelWrap').hidden = !p.imageOn;
  $('spacingWrap').hidden = !p.twoTone;
  $('span').value = S.span;
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
  const aboveTwoLo = p.product === 'rfMinusLo' && p.rfMHz > 2 * p.loMHz;
  drawPlan($('plan'), { rf: p.rfMHz, lo: p.loMHz, out, image: r.imageMHz, product: p.product, mode: aboveTwoLo ? 'aboveTwoLo' : 'mirror' });
  const why = p.product === 'sum'
    ? `F1 + LO lands on ${f(out)} MHz. A signal at ${f(r.imageMHz)} MHz also lands there, because Image − LO gives the same result.`
    : aboveTwoLo
      ? `F1 − LO lands on ${f(out)} MHz. Both F1 and the image are above this low LO, so the image is not a mirror across it. A signal at ${f(r.imageMHz)} MHz reaches the same output through its sum product, Image + LO.`
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
  $('filterPoles').value = f.poles; $('filterPolesOut').textContent = `${f.poles} (${f.poles * 6} dB/octave)`;
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
  $('mGainActual').textContent = dbText(s.carrier ? s.carrier.dbm - S.params.rfDbm : null);
  $('mNf').textContent = dbText(node.nfDb);
  $('mSense').textContent = S.result.scene.noLo ? '–' : node.pastMixer && S.result.inverted ? 'Inverted' : 'Normal';
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
  renderPlan();
  renderSpectrum();
  renderFilter();
  renderTable(node, s);
  renderLesson(node, s);
  scheduleSlope();
  renderMeasures(node, s);
}

function applyLesson(index) {
  const scene = SCENES[S.sceneId], list = LESSONS[S.sceneId];
  S.lesson = index;
  // Lessons build on one another, so replay from the scene defaults up to this step.
  S.params = { ...scene.defaults, filters: {} };
  for (let i = 0; i <= index; i++) Object.assign(S.params, list[i].set);
  const lesson = list[index];
  S.span = lesson.span;
  S.nodeIndex = scene.stages.length;
  S.hoverX = null;
  render();
}

function setScene(id) {
  S.sceneId = id;
  const filters = SCENES[id].stages.filter((x) => x.type === 'filter');
  S.filterId = filters[0].id;
  $('filterPick').replaceChildren(...filters.map((x) => new Option(x.name, x.id)));
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
    const { [S.filterId]: _removed, ...rest } = S.params.filters;
    S.params.filters = rest;
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
  window.addEventListener('resize', () => { renderPlan(); renderSpectrum(); renderFilter(); drawSlope($('slope'), S.slope, S.params.rfDbm); });
}

wire();
setScene('bench');
