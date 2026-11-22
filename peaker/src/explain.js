// Plain-language description of what a pointing controller is doing right now.
import { chipFor } from './timeline.js';

const SEARCH = {
  spiral: { name: 'Spiral search', how: 'It walks an outward spiral with points half a beamwidth apart, so it cannot jump over the main lobe. A spiral checks near the starting point first, which suits a small pointing error.' },
  raster: { name: 'Raster scan', how: 'It sweeps back and forth in rows, half a beamwidth apart, like mowing a lawn. A raster covers a whole square evenly and makes the lobes easy to see on the map, but it takes the same time wherever the satellite is.' },
};
const TRACK_STEPS = ['Az center', 'Az −', 'Az +', 'El center', 'El −', 'El +', 'Hold'];
const AXIS = { az: 'azimuth', el: 'elevation' };
const POINT = ['the center', 'one step below center', 'one step above center'];

const signed = (d) => (Math.abs(d) < 0.0005 ? '0.000°' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(3)}°`);

function fitSentence(fit, axis) {
  if (!fit) return '';
  const atLimit = Math.abs(fit.delta) >= fit.step - 1e-9;
  return ` Last ${AXIS[axis]} fit: move ${signed(fit.delta)}${atLimit ? ', the most one cycle allows, so the peak is probably farther that way' : ''}.`;
}

const dbm = (v) => `${v.toFixed(1)} dBm`;
const relDb = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} dB`;
// Controllers work in their own frame, which program track shifts along the orbit.
const absolute = (r, p) => ({ az: (((p.az + (r.frame?.az ?? 0)) % 360) + 360) % 360, el: p.el + (r.frame?.el ?? 0) });

function describeMeasure(run, r) {
  const axisName = AXIS[r.axis];
  const where = run.kind === 'peak' ? `Refine pass ${r.pass} of 3` : `Cycle ${r.cycle}`;
  const pos = absolute(r, r)[r.axis].toFixed(3);
  if (r.point === 0) {
    return { title: `${where}: ${axisName} center`, text: `Read ${dbm(r.db)} with ${axisName} at ${pos}°. This is the reference that the next two readings are compared with.` };
  }
  const change = relDb(r.db - r.samples[0]);
  // Azimuth lines converge toward zenith, so one degree on the sky takes more than one degree of azimuth.
  const azTurn = Math.abs(((r.az - r.oldCenter.az + 540) % 360) - 180);
  const sky = r.axis === 'az' ? ` on the sky (${azTurn.toFixed(3)}° of azimuth at this elevation)` : '';
  if (r.point === 1) {
    return { title: `${where}: ${axisName} minus one step`, text: `Moved ${r.step.toFixed(3)}°${sky} below center, to ${axisName} ${pos}°, and read ${dbm(r.db)}. That is ${change} compared with center.` };
  }
  const from = absolute(r, r.oldCenter)[r.axis].toFixed(3), to = absolute(r, r.newCenter)[r.axis].toFixed(3);
  const atLimit = Math.abs(r.fit.delta) >= r.step - 1e-9;
  return {
    title: `${where}: ${axisName} plus one step, then fit`,
    text: `Moved ${r.step.toFixed(3)}°${sky} above center, to ${axisName} ${pos}°, and read ${dbm(r.db)}, which is ${change} compared with center. The parabola through all three readings peaks at ${signed(r.fit.delta)}, so the center moves from ${from}° to ${to}°.${atLimit ? ' That is the largest move one fit allows, so the true peak is probably farther that way.' : ''}`,
  };
}

// Describes one recorded reading, with its real numbers.
export function describeRecord(run, r) {
  const steps = run.kind === 'peak' ? [SEARCH[run.pattern].name, 'Refine', 'Peaked'] : TRACK_STEPS;
  const active = chipFor(run, r);
  const pos = absolute(r, r);
  if (r.stage === 'search') {
    const isBest = r.bestIndex === r.index;
    return {
      steps, active, title: `${steps[0]}: point ${r.index + 1} of ${r.total}`,
      text: `Read ${dbm(r.db)} at azimuth ${pos.az.toFixed(3)}°, elevation ${pos.el.toFixed(3)}°. ${isBest ? 'This is the strongest reading so far.' : `The strongest so far is ${dbm(r.bestDb)} at point ${r.bestIndex + 1}.`}`,
    };
  }
  if (r.stage === 'notfound') {
    return { steps, active, title: 'No beacon found', text: `The strongest reading was ${dbm(r.bestDb)}, too close to the noise floor to trust, so the antenna returned to where it started.` };
  }
  if (r.stage === 'done') {
    return { steps, active, title: 'Peaked', text: `Final pointing is azimuth ${pos.az.toFixed(3)}°, elevation ${pos.el.toFixed(3)}°.${fitSentence(r.fits.az, 'az')}${fitSentence(r.fits.el, 'el')}` };
  }
  if (r.stage === 'hold') {
    return { steps, active, title: `Cycle ${r.cycle}: holding`, text: `Settled at azimuth ${pos.az.toFixed(3)}°, elevation ${pos.el.toFixed(3)}°, and held for about ${r.holdS.toFixed(0)} s before the next cycle.${fitSentence(r.fits.az, 'az')}${fitSentence(r.fits.el, 'el')}` };
  }
  return { steps, active, ...describeMeasure(run, r) };
}

// Rebuilds what the explainer plot should show at a recorded reading.
export function recordView(run, r) {
  if (r.stage === 'search' || r.stage === 'notfound') {
    const measured = [];
    for (const x of run.records) {
      if (x.stage !== 'search' || (r.stage === 'search' && x.index > r.index)) continue;
      measured[x.index] = x.db;
    }
    return { kind: 'peak', phase: r.stage, pattern: run.pattern, path: run.path, measured, index: r.index ?? 0, bestIndex: r.bestIndex };
  }
  if (r.stage === 'measure') {
    return {
      kind: run.kind, phase: run.kind === 'peak' ? 'refine' : 'cycle', highlight: { axis: r.axis, point: r.point },
      scan: { axis: r.axis, point: r.point, step: r.step, fits: r.fits, samples: r.samples.length < 3 ? r.samples : [] },
    };
  }
  return { kind: run.kind, phase: r.stage, scan: { axis: 'az', point: 0, step: r.step, fits: r.fits, samples: [] } };
}

export function describeController(info) {
  if (!info) {
    return {
      steps: [], active: -1, title: 'Manual pointing',
      text: 'Move the antenna and watch the beacon rise and fall. Small bumps are side lobes, and the tall center peak is the main lobe. Press Auto-peak or Step-track to watch a controller do this using only the measured signal.',
    };
  }
  if (info.kind === 'peak') {
    const search = SEARCH[info.pattern];
    const PEAK_STEPS = [search.name, 'Refine', 'Peaked'];
    if (info.phase === 'search') {
      return {
        steps: PEAK_STEPS, active: 0, title: `${search.name}: point ${info.index + 1} of ${info.total}`,
        text: `The controller does not know where the satellite is. ${search.how} It finishes the whole pattern before choosing, because stopping at the first bump could lock onto a side lobe.`,
      };
    }
    if (info.phase === 'refine') {
      return {
        steps: PEAK_STEPS, active: 1, title: `Refining ${AXIS[info.scan.axis]}: pass ${info.pass} of 3, measuring ${POINT[info.scan.point]}`,
        text: 'Near the top, the main lobe in dB is shaped almost like a parabola. Three power readings define that curve, so the controller can calculate where the top is and move straight there, then repeat on the other axis.',
      };
    }
    if (info.phase === 'done') {
      return {
        steps: PEAK_STEPS, active: 2, title: 'Peaked',
        text: `Search found the strongest point, and three passes of parabola fits centered the beam.${fitSentence(info.scan?.fits.az, 'az')}${fitSentence(info.scan?.fits.el, 'el')} Small final moves mean the fit has converged.`,
      };
    }
    return {
      steps: PEAK_STEPS, active: 0, title: 'No beacon found',
      text: 'No point in the scan rose far enough above the noise floor, so the antenna went back to where it started. Try pointing closer to the predicted position, or use a larger dish.',
    };
  }
  const { axis, point, fits } = info.scan;
  if (info.phase === 'hold') {
    return {
      steps: TRACK_STEPS, active: 6, title: `Holding: next cycle in ${Math.ceil(info.nextInS)} s`,
      text: `The antenna sits still between cycles, because every test step briefly moves the beam off the peak and costs signal. Cycle ${info.cycles} is complete.${fitSentence(fits.az, 'az')}${fitSentence(fits.el, 'el')}${info.lost ? ' The signal is near the noise floor, so tracking is lost.' : ''}`,
    };
  }
  return {
    steps: TRACK_STEPS, active: (axis === 'az' ? 0 : 3) + point, title: `Step-track: measuring ${AXIS[axis]} at ${POINT[point]}`,
    text: `Step-track nudges the antenna a quarter beamwidth each way on one axis, compares the three readings, and moves toward the stronger side. Then it does the same on the other axis. This follows a slowly drifting satellite without knowing its orbit.${info.lost ? ' The signal is near the noise floor, so tracking is lost.' : ''}`,
  };
}
