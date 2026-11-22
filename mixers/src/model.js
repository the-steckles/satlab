// Scenes and measurements for the mixer simulator. Values are typical, not a specific product's datasheet.
import { amplifier, bandpass, cascade, createGrid, createSignal, filter, levelOf, lowpass, mixer, mixerLossDb, products } from '../../lib/tones.js';

const MHZ = 1e6;

export const SCENES = {
  bench: {
    name: 'Bench', short: 'Bench', sign: -1,
    intro: 'One mixer on a test bench. Change the inputs and see every product it creates.',
    defaults: { rfMHz: 2000, loMHz: 1700, rfDbm: -10, loDbm: 7, spacingMHz: 1, twoTone: false, imageOn: false, imageDbm: -10, mixerType: 'double', filtersOn: false },
    inputName: 'RF in',
    stages: [
      { id: 'mixer', type: 'mixer', name: 'Mixer', excessLossDb: 2.5, iip3Dbm: 15 },
      { id: 'ifFilter', type: 'filter', name: 'IF low-pass', kind: 'if', poles: 5, lossDb: 0.5 },
    ],
  },
  groundUp: {
    name: 'Ground uplink', short: 'Ground up', sign: 1, noImage: true,
    intro: 'The modem’s L-band IF is upconverted to Ku-band and amplified for the antenna.',
    defaults: { rfMHz: 1200, loMHz: 13050, rfDbm: -30, loDbm: 7, spacingMHz: 1, twoTone: true, imageOn: false, imageDbm: -30, mixerType: 'double', filtersOn: true },
    inputName: 'Modem IF',
    stages: [
      { id: 'ifAmp', type: 'amp', name: 'IF amp', gainDb: 20, oip3Dbm: 25, nfDb: 4 },
      { id: 'mixer', type: 'mixer', name: 'BUC mixer', excessLossDb: 3, iip3Dbm: 15 },
      { id: 'rfFilter', type: 'filter', name: 'Tx band filter', kind: 'bp', centerMHz: 14250, bwMHz: 500, poles: 5, lossDb: 1 },
      { id: 'hpa', type: 'amp', name: 'HPA', gainDb: 55, oip3Dbm: 60, nfDb: 8 },
    ],
  },
  satRx: {
    name: 'Satellite receive', short: 'Sat receive', sign: -1,
    intro: 'The uplink reaches the satellite very weak. It is amplified, then shifted to the downlink band.',
    defaults: { rfMHz: 14250, loMHz: 1750, rfDbm: -90, loDbm: 7, spacingMHz: 1, twoTone: true, imageOn: false, imageDbm: -80, mixerType: 'double', filtersOn: true },
    inputName: 'Uplink',
    stages: [
      { id: 'inFilter', type: 'filter', name: 'Rx band filter', kind: 'bp', centerMHz: 14250, bwMHz: 500, poles: 5, lossDb: 0.3 },
      { id: 'lna', type: 'amp', name: 'LNA', gainDb: 30, oip3Dbm: 20, nfDb: 1.2 },
      { id: 'mixer', type: 'mixer', name: 'Downconverter', excessLossDb: 3, iip3Dbm: 15 },
      { id: 'imux', type: 'filter', name: 'Channel filter', kind: 'bp', centerMHz: 12500, bwMHz: 36, poles: 5, lossDb: 1 },
    ],
  },
  satTx: {
    name: 'Satellite downlink', short: 'Sat downlink', sign: 0, noLo: true,
    intro: 'A channel amplifier drives the TWTA. Backing off from saturation trades power for linearity.',
    defaults: { rfMHz: 12500, loMHz: 0, rfDbm: -45, loDbm: 7, spacingMHz: 1, twoTone: true, imageOn: false, imageDbm: -45, mixerType: 'double', filtersOn: true },
    inputName: 'Channel in',
    stages: [
      { id: 'cha', type: 'amp', name: 'Channel amp', gainDb: 40, oip3Dbm: 25, nfDb: 8 },
      { id: 'twta', type: 'amp', name: 'TWTA', gainDb: 50, oip3Dbm: 54.3, nfDb: 25 },
      { id: 'omux', type: 'filter', name: 'Output filter', kind: 'bp', centerMHz: 12500, bwMHz: 36, poles: 5, lossDb: 0.5 },
    ],
  },
  groundDown: {
    name: 'Ground downlink', short: 'Ground down', sign: -1,
    intro: 'An LNB at the feed amplifies the faint downlink and converts it to L-band for the modem.',
    defaults: { rfMHz: 12000, loMHz: 10750, rfDbm: -95, loDbm: 7, spacingMHz: 1, twoTone: false, imageOn: true, imageDbm: -85, mixerType: 'double', filtersOn: true },
    inputName: 'Feed',
    stages: [
      { id: 'lna', type: 'amp', name: 'LNA', gainDb: 55, oip3Dbm: 20, nfDb: 0.8 },
      { id: 'imageFilter', type: 'filter', name: 'Image filter', kind: 'bp', centerMHz: 12000, bwMHz: 1000, poles: 5, lossDb: 1 },
      { id: 'mixer', type: 'mixer', name: 'LNB mixer', excessLossDb: 3, iip3Dbm: 15 },
      // Before the IF amp, so the strong sum product cannot add its own intermodulation there.
      { id: 'ifFilter', type: 'filter', name: 'IF low-pass', kind: 'if', poles: 5, lossDb: 0.5 },
      { id: 'ifAmp', type: 'amp', name: 'IF amp', gainDb: 25, oip3Dbm: 25, nfDb: 6 },
    ],
  },
};

export const imageMHz = (p) => Math.abs(2 * p.loMHz - p.rfMHz);
export const wantedMHz = (scene, p) => (scene.sign === 0 ? p.rfMHz : scene.sign > 0 ? p.rfMHz + p.loMHz : Math.abs(p.rfMHz - p.loMHz));

function responseFor(stage, scene, p) {
  if (stage.kind === 'if') return lowpass(Math.max(50, wantedMHz(scene, p) * 1.6) * MHZ, stage.poles, stage.lossDb);
  return bandpass(stage.centerMHz * MHZ, stage.bwMHz * MHZ, stage.poles, stage.lossDb);
}

function buildGrid(scene, p, tones) {
  const sources = tones.map((t) => ({ id: t.id, hz: t.mhz * MHZ }));
  if (!scene.noLo) sources.push({ id: 'LO', hz: p.loMHz * MHZ });
  return createGrid(sources, sources.length > 3 ? 5 : 7);
}

function inputTones(scene, p) {
  const half = p.spacingMHz / 2;
  const tones = p.twoTone
    ? [{ id: 'F1', mhz: p.rfMHz - half, dbm: p.rfDbm }, { id: 'F2', mhz: p.rfMHz + half, dbm: p.rfDbm }]
    : [{ id: 'F1', mhz: p.rfMHz, dbm: p.rfDbm }];
  if (p.imageOn && !scene.noImage && !scene.noLo) tones.push({ id: 'IMG', mhz: imageMHz(p), dbm: p.imageDbm });
  return tones;
}

const stageGainDb = (stage, p) => {
  if (stage.type === 'amp') return stage.gainDb;
  if (stage.type === 'filter') return p.filtersOn ? -stage.lossDb : 0;
  return -mixerLossDb({ loDbm: p.loDbm, excessLossDb: stage.excessLossDb });
};

function cascadeSpec(stage, p) {
  const gainDb = stageGainDb(stage, p);
  if (stage.type === 'amp') return { gainDb, nfDb: stage.nfDb, oip3Dbm: stage.oip3Dbm };
  if (stage.type === 'mixer') return { gainDb, nfDb: -gainDb, oip3Dbm: stage.iip3Dbm + gainDb };
  return { gainDb, nfDb: -gainDb };
}

function applyStage(sig, stage, scene, p) {
  if (stage.type === 'amp') return amplifier(sig, stage);
  if (stage.type === 'mixer') return mixer(sig, { lo: 'LO', loDbm: p.loDbm, type: p.mixerType, excessLossDb: stage.excessLossDb, iip3Dbm: stage.iip3Dbm });
  return p.filtersOn ? filter(sig, responseFor(stage, scene, p)) : sig;
}

export function classify(product, sources, sign, pastMixer) {
  const at = (id) => { const i = sources.findIndex((s) => s.id === id); return i < 0 ? 0 : product.m[i]; };
  const f1 = at('F1'), f2 = at('F2'), lo = at('LO'), img = at('IMG');
  if (img) return Math.abs(img) === 1 && !f1 && !f2 && Math.abs(lo) <= 1 ? 'image' : 'spur';
  const wantedLo = pastMixer ? sign : 0;
  for (const tone of [[f1, f2], [f2, f1]]) {
    if (Math.abs(tone[0]) === 1 && !tone[1] && lo === tone[0] * wantedLo) return 'wanted';
  }
  if (f1 && f2) return Math.abs(f1) + Math.abs(f2) === 3 && Math.abs(f1 + f2) === 1 && lo === (f1 + f2) * wantedLo ? 'im3' : 'spur';
  if (!f1 && !f2) return 'lo';
  return 'spur';
}

// Runs the input through every stage and records the spectrum at each test point.
export function runScene(sceneId, params) {
  const scene = SCENES[sceneId], p = { ...scene.defaults, ...params };
  const tones = inputTones(scene, p);
  const grid = buildGrid(scene, p, tones);
  let sig = createSignal(grid, tones);
  let pastMixer = false;
  const specs = [];
  const nodeFor = (id, name) => {
    const c = cascade(specs.length ? specs : [{ gainDb: 0, nfDb: 0 }]);
    const kindOf = (x) => classify(x, grid.sources, scene.sign, pastMixer);
    const list = products(sig, -220).map((x) => ({ ...x, kind: kindOf(x), parts: x.parts.map((part) => ({ ...part, kind: kindOf(part) })) }));
    return { id, name, products: list, pastMixer, gainDb: c.gainDb, nfDb: c.nfDb, iip3Dbm: c.iip3Dbm, oip3Dbm: c.oip3Dbm };
  };
  const nodes = [nodeFor('in', scene.inputName)];
  for (const stage of scene.stages) {
    sig = applyStage(sig, stage, scene, p);
    if (stage.type === 'mixer') pastMixer = true;
    specs.push(cascadeSpec(stage, p));
    nodes.push({ ...nodeFor(stage.id, stage.name), bypassed: stage.type === 'filter' && !p.filtersOn });
  }
  return { scene, params: p, nodes, sources: grid.sources, wantedMHz: wantedMHz(scene, p), imageMHz: scene.noLo ? null : imageMHz(p) };
}

export const noiseFloorDbm = (node, rbwHz) => -174 + 10 * Math.log10(rbwHz) + node.nfDb + node.gainDb;

// Headline numbers for one test point.
export function summarize(node) {
  // An image lands exactly on the carrier, so read the individual contributions rather than their sum.
  const parts = node.products.flatMap((x) => x.parts).sort((a, b) => b.dbm - a.dbm);
  const carrier = parts.find((x) => x.kind === 'wanted') ?? null;
  const worst = parts.find((x) => x.kind !== 'wanted') ?? null;
  const im3 = parts.find((x) => x.kind === 'im3') ?? null;
  const image = parts.find((x) => x.kind === 'image') ?? null;
  const lo = parts.find((x) => x.kind === 'lo') ?? null;
  const dbc = (x) => (x && carrier ? x.dbm - carrier.dbm : null);
  const oip3 = carrier && im3 ? carrier.dbm + (carrier.dbm - im3.dbm) / 2 : null;
  return { carrier, worst, worstDbc: dbc(worst), im3, im3Dbc: dbc(im3), image, imageDbc: dbc(image), lo, loDbc: dbc(lo), oip3 };
}

function wantedLevel(sceneId, p, nodeIndex, spur) {
  const scene = SCENES[sceneId], tones = inputTones(scene, p), grid = buildGrid(scene, p, tones);
  let sig = createSignal(grid, tones);
  let mixed = false;
  scene.stages.slice(0, nodeIndex).forEach((s) => { sig = applyStage(sig, s, scene, p); if (s.type === 'mixer') mixed = true; });
  const m = grid.sources.map((s) => (s.id === 'F1' ? spur[0] : s.id === 'F2' ? spur[1] : s.id === 'LO' ? spur.reduce((a, b) => a + b, 0) * (mixed ? scene.sign : 0) : 0));
  return levelOf(sig, m);
}

// Output against input: compression from one tone, third-order products from two.
export function sweep(sceneId, params, nodeIndex, points = 25) {
  const scene = SCENES[sceneId], base = { ...scene.defaults, ...params, imageOn: false };
  const iip3 = runScene(sceneId, { ...base, twoTone: false }).nodes[nodeIndex].iip3Dbm;
  const center = Number.isFinite(iip3) ? iip3 : base.rfDbm + 30;
  const from = center - 45, to = center + 6, out = [];
  for (let i = 0; i < points; i++) {
    const pin = from + ((to - from) * i) / (points - 1);
    const single = wantedLevel(sceneId, { ...base, twoTone: false, rfDbm: pin }, nodeIndex, [1, 0]);
    const two = { ...base, twoTone: true, rfDbm: pin };
    out.push({ pin, single, tone: wantedLevel(sceneId, two, nodeIndex, [1, 0]), im3: wantedLevel(sceneId, two, nodeIndex, [2, -1]) });
  }
  const first = out[0], gain = first.single - first.pin;
  let p1dB = null;
  for (let i = 1; i < out.length; i++) {
    const a = first.pin + (out[i - 1].pin - first.pin) + gain - out[i - 1].single, b = out[i].pin + gain - out[i].single;
    if (a < 1 && b >= 1) {
      const t = (1 - a) / (b - a), pin = out[i - 1].pin + t * (out[i].pin - out[i - 1].pin);
      p1dB = { pin, pout: pin + gain - 1 };
      break;
    }
  }
  const low = out.find((x) => Number.isFinite(x.im3)) ?? first;
  const oip3 = Number.isFinite(low.im3) ? low.tone + (low.tone - low.im3) / 2 : null;
  return { points: out, gain, p1dB, oip3, iip3: oip3 === null ? null : oip3 - gain };
}
