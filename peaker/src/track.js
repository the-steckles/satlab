// Pointing controllers. They see only measured power and their own commanded az/el.
// Call update(powerDbm) once per sweep after the antenna reaches the last returned target.

const toLinear = (db) => 10 ** (db / 10);
const toDb = (p) => 10 * Math.log10(p);
const wrapAz = (az) => ((az % 360) + 360) % 360;
const cosEl = (el) => Math.max(0.05, Math.cos((el * Math.PI) / 180));
const offset = (c, x, y) => ({ az: wrapAz(c.az + x / cosEl(c.el)), el: Math.min(90, Math.max(0, c.el + y)) });

// Vertex of a parabola through three dB samples. The main beam is close to parabolic in dB.
export function parabolicOffset(minus, center, plus, step) {
  const curve = minus - 2 * center + plus;
  if (curve >= -1e-6) return plus > minus ? step : minus > plus ? -step : 0;
  return Math.max(-step, Math.min(step, (step * (minus - plus)) / (2 * curve)));
}

// Averages power over `dwell` sweeps at each point.
function averager(dwell) {
  let sum = 0, n = 0;
  return (db) => {
    sum += toLinear(db);
    if (++n < dwell) return null;
    const avg = toDb(sum / n);
    sum = 0; n = 0;
    return avg;
  };
}

export function spiralPoints(radiusDeg, spacingDeg) {
  const pts = [{ x: 0, y: 0 }];
  const b = spacingDeg / (2 * Math.PI);
  for (let t = spacingDeg / b; b * t <= radiusDeg;) {
    pts.push({ x: b * t * Math.cos(t), y: b * t * Math.sin(t) });
    t += spacingDeg / (b * t);
  }
  return pts;
}

// Every reading is kept so a run can be paused and stepped through afterward.
const MAX_RECORDS = 2000;
const pushRecord = (records, r) => {
  records.push(r);
  if (records.length > MAX_RECORDS) records.shift();
};

// Back-and-forth rows covering a square, the way a raster scan paints an image.
export function rasterPoints(radiusDeg, spacingDeg) {
  const n = Math.ceil((2 * radiusDeg) / spacingDeg) + 1;
  const gap = (2 * radiusDeg) / (n - 1);
  const pts = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const c = row % 2 ? n - 1 - col : col;
      pts.push({ x: -radiusDeg + c * gap, y: -radiusDeg + row * gap });
    }
  }
  return pts;
}

// Three-point az then el measurement around a center. Returns the corrected center per cycle.
function crossScan(start, step, dwell, onReading = () => {}) {
  let avg = averager(dwell);
  let center = { ...start }, axis = 0, idx = 0, samples = [];
  const fits = { az: null, el: null };
  const pattern = [0, -1, 1];
  const point = () => {
    const d = pattern[idx] * step;
    return axis === 0 ? offset(center, d, 0) : offset(center, 0, d);
  };
  return {
    target: point,
    center: () => center,
    setDwell(n) { avg = averager(n); },
    get state() { return { axis: axis === 0 ? 'az' : 'el', point: idx, step, samples: [...samples], fits: { ...fits } }; },
    feed(db) {
      const v = avg(db);
      if (v === null) return null;
      const at = point(), name = axis === 0 ? 'az' : 'el', oldCenter = { ...center };
      samples.push(v);
      const record = { stage: 'measure', axis: name, point: idx, step, db: v, az: at.az, el: at.el, samples: [...samples], fits: { ...fits }, fit: null, oldCenter, newCenter: null };
      if (++idx < 3) { onReading(record); return null; }
      const delta = parabolicOffset(samples[1], samples[0], samples[2], step);
      fits[name] = { step, center: samples[0], minus: samples[1], plus: samples[2], delta };
      center = axis === 0 ? offset(center, delta, 0) : offset(center, 0, delta);
      onReading({ ...record, fit: fits[name], fits: { ...fits }, newCenter: { ...center } });
      const level = samples[0];
      idx = 0; samples = [];
      axis = 1 - axis;
      return { level, delta, axisDone: axis === 0 };
    },
  };
}

export function createAutoPeak({ az, el, beamwidthDeg, radiusDeg, noiseDbm, dwell = 2, marginDb = 6, pattern = 'spiral' }) {
  const origin = { az, el };
  const path = (pattern === 'raster' ? rasterPoints : spiralPoints)(radiusDeg, beamwidthDeg * 0.5);
  const points = path.map((p) => offset(origin, p.x, p.y));
  const measured = [], records = [];
  const run = { kind: 'peak', pattern, path, records };
  const avg = averager(dwell);
  let i = 0, bestIndex = 0, best = { db: -Infinity, ...origin }, phase = 'search', scan = null, cycles = 0;

  return {
    run,
    get phase() { return phase; },
    get explain() {
      return { kind: 'peak', phase, index: Math.min(i, points.length - 1), total: points.length, pattern, path, measured, bestIndex, bestDb: best.db, pass: Math.min(cycles + 1, 3), scan: scan?.state ?? null };
    },
    get progress() { return phase === 'search' ? i / points.length : 1; },
    target: () => (phase === 'search' ? points[Math.min(i, points.length - 1)] : phase === 'refine' ? scan.target() : { az: best.az, el: best.el }),
    update(db) {
      if (phase === 'search') {
        const v = avg(db);
        if (v === null) return;
        measured[i] = v;
        if (v > best.db) { best = { db: v, ...points[i] }; bestIndex = i; }
        pushRecord(records, { stage: 'search', index: i, total: points.length, db: v, az: points[i].az, el: points[i].el, bestIndex, bestDb: best.db });
        if (++i < points.length) return;
        if (best.db < noiseDbm + marginDb) {
          phase = 'notfound';
          best = { ...best, ...origin };
          pushRecord(records, { stage: 'notfound', az: origin.az, el: origin.el, bestIndex, bestDb: best.db });
          return;
        }
        phase = 'refine';
        scan = crossScan(best, beamwidthDeg / 3, dwell + 1, (r) => pushRecord(records, { ...r, pass: cycles + 1 }));
      } else if (phase === 'refine') {
        const r = scan.feed(db);
        if (r?.axisDone && ++cycles >= 3) {
          const c = scan.center();
          best = { ...best, az: c.az, el: c.el };
          phase = 'done';
          const { fits, step } = scan.state;
          pushRecord(records, { stage: 'done', az: c.az, el: c.el, fits, step });
        }
      }
    },
  };
}

// Runs one az/el cycle every intervalS (start to start), holding on the peak in between.
export function createStepTrack({ az, el, beamwidthDeg, noiseDbm, dwell = 2, lossMarginDb = 4, intervalS = 0 }) {
  const records = [];
  const run = { kind: 'track', records };
  const scan = crossScan({ az, el }, beamwidthDeg / 4, dwell, (r) => pushRecord(records, { ...r, cycle: cycles + 1 }));
  let monitor = averager(dwell);
  let phase = 'tracking', level = null, waiting = false, elapsed = 0, cycles = 0;
  const setLevel = (v) => {
    level = v;
    phase = v < noiseDbm + lossMarginDb ? 'lost' : 'tracking';
  };
  return {
    run,
    get phase() { return phase; },
    get level() { return level; },
    get cycles() { return cycles; },
    get waiting() { return waiting; },
    get nextInS() { return waiting ? Math.max(0, intervalS - elapsed) : 0; },
    get explain() {
      return { kind: 'track', phase: waiting ? 'hold' : 'cycle', lost: phase === 'lost', scan: scan.state, cycles, nextInS: waiting ? Math.max(0, intervalS - elapsed) : 0, intervalS, level };
    },
    setIntervalS(s) { intervalS = s; },
    setDwell(n) { scan.setDwell(n); monitor = averager(n); },
    target: () => (waiting ? scan.center() : scan.target()),
    advance(dt) {
      elapsed += dt;
      if (waiting && elapsed >= intervalS) { waiting = false; elapsed = 0; }
    },
    update(db) {
      if (waiting) {
        const v = monitor(db);
        if (v !== null) setLevel(v);
        return;
      }
      const r = scan.feed(db);
      if (!r) return;
      setLevel(r.level);
      if (r.axisDone) {
        cycles++;
        if (elapsed < intervalS) {
          waiting = true;
          const c = scan.center(), { fits, step } = scan.state;
          pushRecord(records, { stage: 'hold', cycle: cycles, az: c.az, el: c.el, fits, step, holdS: intervalS - elapsed });
        } else elapsed = 0;
      }
    },
  };
}
