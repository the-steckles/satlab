// Scenes and measurements for the mixer simulator. Values are typical, not a specific product's datasheet.
import { amplifier, bandpass, cascade, createGrid, createSignal, filter, levelOf, mixer, mixerLossDb, products } from '../../lib/tones.js';

const MHZ = 1e6;

export const SCENES = {
  bench: {
    name: 'Bench', short: 'Bench',
    intro: 'One mixer on a test bench. Change the inputs and see every product it creates.',
    defaults: { rfMHz: 2000, loMHz: 1700, rfDbm: -10, loDbm: 7, spacingMHz: 1, twoTone: false, imageOn: false, imageDbm: -10, mixerType: 'double', filtersOn: false, product: 'rfMinusLo', holdOutput: false },
    inputName: 'RF in',
    stages: [
      { id: 'mixer', type: 'mixer', name: 'Mixer', excessLossDb: 2.5, iip3Dbm: 15, about: 'Multiplies the input by the LO, creating sum and difference frequencies plus weaker harmonics.' },
      { id: 'ifFilter', type: 'filter', name: 'Output filter', kind: 'if', poles: 5, lossDb: 0.5, about: 'Follows the product you selected and rejects the other products the mixer created.' },
    ],
  },
  groundUp: {
    name: 'Ground uplink', short: 'Ground up', noImage: true,
    intro: 'The modem’s L-band IF is upconverted to Ku-band and amplified for the antenna.',
    defaults: { rfMHz: 1200, loMHz: 13050, rfDbm: -30, loDbm: 7, spacingMHz: 1, twoTone: true, imageOn: false, imageDbm: -30, mixerType: 'double', filtersOn: true, product: 'sum', holdOutput: true },
    inputName: 'Modem IF',
    stages: [
      { id: 'ifAmp', type: 'amp', name: 'IF amp', gainDb: 20, oip3Dbm: 25, nfDb: 4, about: 'Raises the modem signal to the level the mixer needs.' },
      { id: 'mixer', type: 'mixer', name: 'BUC mixer', excessLossDb: 3, iip3Dbm: 15, about: 'The block upconverter (BUC) mixer moves the L-band IF to the Ku-band uplink frequency.' },
      { id: 'rfFilter', type: 'filter', name: 'Tx band filter', kind: 'bp', center: 'wanted', bwMHz: 500, poles: 5, lossDb: 1, about: 'Keeps the wanted sideband and blocks the LO and other sideband before the high-power amplifier.' },
      { id: 'hpa', type: 'amp', name: 'HPA', gainDb: 55, oip3Dbm: 60, nfDb: 8, about: 'The high-power amplifier drives the antenna. Near its maximum output it compresses and creates intermodulation.' },
    ],
  },
  satRx: {
    name: 'Satellite receive', short: 'Sat receive',
    intro: 'The uplink reaches the satellite very weak. It is amplified, then shifted to the downlink band.',
    defaults: { rfMHz: 14250, loMHz: 1750, rfDbm: -90, loDbm: 7, spacingMHz: 1, twoTone: true, imageOn: false, imageDbm: -80, mixerType: 'double', filtersOn: true, product: 'rfMinusLo', holdOutput: true },
    inputName: 'Uplink',
    stages: [
      { id: 'inFilter', type: 'filter', name: 'Rx band filter', kind: 'bp', center: 'rf', bwMHz: 500, poles: 5, lossDb: 0.3, about: 'Passes the uplink band and keeps strong out-of-band signals from overloading the LNA.' },
      { id: 'lna', type: 'amp', name: 'LNA', gainDb: 30, oip3Dbm: 20, nfDb: 1.2, about: 'The low-noise amplifier adds gain early, so later stages contribute little noise.' },
      { id: 'imageFilter', type: 'filter', name: 'Image filter', kind: 'bp', center: 'rf', bwMHz: 1000, poles: 5, lossDb: 0.5, about: 'Sits after the LNA so it also removes the LNA’s own noise at the image frequency before the mixer.' },
      { id: 'mixer', type: 'mixer', name: 'Downconverter', excessLossDb: 3, iip3Dbm: 15, about: 'Translates the uplink to the downlink band. The translation depends on the satellite’s frequency plan.' },
      { id: 'imux', type: 'filter', name: 'Channel filter', kind: 'bp', center: 'wanted', bwMHz: 36, poles: 5, lossDb: 1, about: 'The input multiplexer separates one transponder’s bandwidth from the rest of the band.' },
    ],
  },
  satTx: {
    name: 'Satellite downlink', short: 'Sat downlink', noLo: true,
    intro: 'A channel amplifier drives the traveling-wave tube amplifier (TWTA), the satellite’s high-power output stage.',
    defaults: { rfMHz: 12500, loMHz: 0, rfDbm: -52, loDbm: 7, spacingMHz: 1, twoTone: true, imageOn: false, imageDbm: -45, mixerType: 'double', filtersOn: true, product: 'rfMinusLo', holdOutput: true },
    inputName: 'Channel in',
    stages: [
      { id: 'cha', type: 'amp', name: 'Channel amp', gainDb: 40, oip3Dbm: 25, nfDb: 8, about: 'Sets how hard the TWTA is driven. Ground controllers can usually adjust this gain.' },
      { id: 'twta', type: 'amp', name: 'TWTA', gainDb: 50, oip3Dbm: 54.3, nfDb: 25, about: 'A traveling-wave tube amplifier passes the signal along an electron beam and takes energy from it. The beam’s power sets a hard ceiling on RF output, called saturation.' },
      { id: 'omux', type: 'filter', name: 'Output filter', kind: 'bp', center: 'rf', bwMHz: 36, poles: 5, lossDb: 0.5, about: 'The output multiplexer removes out-of-channel products before the antenna.' },
    ],
  },
  groundDown: {
    name: 'Ground downlink', short: 'Ground down',
    intro: 'An LNB at the feed amplifies the faint downlink and converts it to L-band for the modem.',
    defaults: { rfMHz: 12000, loMHz: 10750, rfDbm: -95, loDbm: 7, spacingMHz: 1, twoTone: false, imageOn: true, imageDbm: -85, mixerType: 'double', filtersOn: true, product: 'rfMinusLo', holdOutput: true },
    inputName: 'Feed',
    stages: [
      { id: 'lna', type: 'amp', name: 'LNA', gainDb: 55, oip3Dbm: 20, nfDb: 0.8, about: 'The first amplifier sets most of the receive noise figure.' },
      { id: 'imageFilter', type: 'filter', name: 'Image filter', kind: 'bp', center: 'rf', bwMHz: 1000, poles: 5, lossDb: 1, about: 'Removes the image band while it is still at a different frequency from the wanted signal.' },
      { id: 'mixer', type: 'mixer', name: 'LNB mixer', excessLossDb: 3, iip3Dbm: 15, about: 'Converts Ku-band to L-band so it can travel over coax to the modem.' },
      // Before the IF amp, so the strong sum product cannot add its own intermodulation there.
      { id: 'ifFilter', type: 'filter', name: 'Output filter', kind: 'if', poles: 5, lossDb: 0.5, about: 'Follows the product you selected and rejects the other products the mixer created.' },
      { id: 'ifAmp', type: 'amp', name: 'IF amp', gainDb: 25, oip3Dbm: 25, nfDb: 6, about: 'Makes up for cable loss on the way to the modem.' },
    ],
  },
};

export const PRODUCTS = { sum: 'F1 + LO', rfMinusLo: 'F1 − LO', loMinusRf: 'LO − F1' };

// The other input frequency that converts onto the same output.
export const imageMHz = (p) => (p.product === 'sum' ? p.rfMHz + 2 * p.loMHz : Math.abs(2 * p.loMHz - p.rfMHz));
export const wantedMHz = (scene, p) => (scene.noLo ? p.rfMHz : p.product === 'sum' ? p.rfMHz + p.loMHz : Math.abs(p.rfMHz - p.loMHz));
const signOf = (scene, p) => (scene.noLo ? 0 : p.product === 'sum' ? 1 : -1);
// A difference product with the LO above the input reverses the order of frequencies.
export const isInverted = (scene, p) => !scene.noLo && p.product !== 'sum' && p.loMHz > p.rfMHz;

// The LO that puts a chosen product on an output frequency, or null if none exists.
export function loForProduct(product, rfMHz, outMHz) {
  const lo = product === 'sum' ? outMHz - rfMHz : product === 'rfMinusLo' ? rfMHz - outMHz : rfMHz + outMHz;
  return lo > 0 ? lo : null;
}

// A filter's live settings: the scene's design plus anything the user changed in p.filters.
export function filterSettings(stage, scene, p) {
  const custom = p.filters?.[stage.id] ?? {};
  // Band filters are built for one frequency. Only an IF filter on the bench or LNB output is assumed to be chosen for the plan.
  const followsWanted = stage.kind === 'if' || stage.center === 'wanted', tracks = custom.track ?? stage.kind === 'if';
  const signal = (x) => Math.max(1, followsWanted ? wantedMHz(scene, x) : x.rfMHz);
  const centerMHz = custom.centerMHz ?? signal(tracks ? p : scene.defaults);
  return {
    on: p.filtersOn && custom.on !== false, enabled: custom.on !== false, tracking: tracks && custom.centerMHz === undefined, centerMHz,
    bwMHz: custom.bwMHz ?? (stage.kind === 'if' ? Math.max(20, centerMHz * 0.5) : stage.bwMHz),
    poles: custom.poles ?? stage.poles, lossDb: custom.lossDb ?? stage.lossDb,
  };
}

const responseOf = (s) => bandpass(s.centerMHz * MHZ, s.bwMHz * MHZ, s.poles, s.lossDb);
// The response is symmetric around the center geometrically, so the 3 dB edges are not center ± half the width.
export const filterEdges = ({ centerMHz: c, bwMHz: b }) => [Math.sqrt(b * b / 4 + c * c) - b / 2, Math.sqrt(b * b / 4 + c * c) + b / 2];
export const filterLossAtDb = (settings, mhz) => -20 * Math.log10(responseOf(settings)(mhz * MHZ));

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

const stageGainDb = (stage, scene, p, pastMixer) => {
  if (stage.type === 'amp') return stage.gainDb;
  if (stage.type === 'filter') {
    const f = filterSettings(stage, scene, p);
    return f.on ? -Math.min(300, filterLossAtDb(f, pastMixer ? wantedMHz(scene, p) : p.rfMHz)) : 0;
  }
  return -mixerLossDb({ loDbm: p.loDbm, excessLossDb: stage.excessLossDb });
};

// Noise at the image frequency reaches the mixer and converts onto the output, referred to the chain input.
// shortcut: assumes the mixer converts both bands equally and ignores a bare mixer's own image termination.
function imageNoiseFactor(scene, p) {
  if (scene.noLo || scene.noImage) return 0;
  const before = scene.stages.slice(0, scene.stages.findIndex((s) => s.type === 'mixer'));
  if (!before.some((s) => s.type === 'amp')) return 0;
  let noise = 1, gain = 1;
  for (const s of before) {
    if (s.type === 'amp') {
      const g = 10 ** (s.gainDb / 10);
      noise = (noise + 10 ** (s.nfDb / 10) - 1) * g;
      gain *= g;
    } else {
      const f = filterSettings(s, scene, p);
      if (!f.on) continue;
      const pass = 10 ** (-filterLossAtDb(f, imageMHz(p)) / 10);
      noise = noise * pass + (1 - pass); // A lossy filter also radiates its own thermal noise.
      gain *= 10 ** (-filterLossAtDb(f, p.rfMHz) / 10);
    }
  }
  return noise / gain;
}

function cascadeSpec(stage, scene, p, pastMixer) {
  const gainDb = stageGainDb(stage, scene, p, pastMixer);
  if (stage.type === 'amp') return { gainDb, nfDb: stage.nfDb, oip3Dbm: stage.oip3Dbm };
  if (stage.type === 'mixer') return { gainDb, nfDb: -gainDb, oip3Dbm: stage.iip3Dbm + gainDb };
  return { gainDb, nfDb: -gainDb };
}

function applyStage(sig, stage, scene, p) {
  if (stage.type === 'amp') return amplifier(sig, stage);
  if (stage.type === 'mixer') return mixer(sig, { lo: 'LO', loDbm: p.loDbm, type: p.mixerType, excessLossDb: stage.excessLossDb, iip3Dbm: stage.iip3Dbm });
  const settings = filterSettings(stage, scene, p);
  return settings.on ? filter(sig, responseOf(settings)) : sig;
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
    const kindOf = (x) => classify(x, grid.sources, signOf(scene, p), pastMixer);
    const list = products(sig, -220).map((x) => ({ ...x, kind: kindOf(x), parts: x.parts.map((part) => ({ ...part, kind: kindOf(part) })) }));
    const nfDb = pastMixer ? 10 * Math.log10(10 ** (c.nfDb / 10) + imageNoiseFactor(scene, p)) : c.nfDb;
    return { id, name, products: list, pastMixer, gainDb: c.gainDb, nfDb, iip3Dbm: c.iip3Dbm, oip3Dbm: c.oip3Dbm };
  };
  const nodes = [nodeFor('in', scene.inputName)];
  for (const stage of scene.stages) {
    sig = applyStage(sig, stage, scene, p);
    if (stage.type === 'mixer') pastMixer = true;
    specs.push(cascadeSpec(stage, scene, p, pastMixer));
    nodes.push({ ...nodeFor(stage.id, stage.name), bypassed: stage.type === 'filter' && !filterSettings(stage, scene, p).on });
  }
  return { scene, params: p, nodes, sources: grid.sources, wantedMHz: wantedMHz(scene, p), imageMHz: scene.noLo ? null : imageMHz(p), inverted: isInverted(scene, p) };
}

export const noiseFloorDbm = (node, rbwHz) => -174 + 10 * Math.log10(rbwHz) + node.nfDb + node.gainDb;

// Headline numbers for one test point.
export function summarize(node) {
  // An image lands exactly on the carrier, so read the individual contributions rather than their sum.
  const parts = node.products.flatMap((x) => x.parts).sort((a, b) => b.dbm - a.dbm);
  const carrier = parts.find((x) => x.kind === 'wanted') ?? null;
  const worst = parts.find((x) => x.kind !== 'wanted') ?? null;
  const im3 = parts.find((x) => x.kind === 'im3') ?? null;
  // Report the image product that lands on the carrier, not its feedthrough elsewhere.
  const images = parts.filter((x) => x.kind === 'image');
  const image = carrier && images.length ? images.reduce((a, b) => (Math.abs(b.hz - carrier.hz) < Math.abs(a.hz - carrier.hz) ? b : a)) : images[0] ?? null;
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
  const m = grid.sources.map((s) => (s.id === 'F1' ? spur[0] : s.id === 'F2' ? spur[1] : s.id === 'LO' ? spur.reduce((a, b) => a + b, 0) * (mixed ? signOf(scene, p) : 0) : 0));
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
