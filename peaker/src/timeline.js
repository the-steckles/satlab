// Navigation through the readings a controller recorded.

// Index of the stage chip a record belongs to.
export function chipFor(run, r) {
  if (r.stage === 'search' || r.stage === 'notfound') return 0;
  if (r.stage === 'done') return 2;
  if (r.stage === 'hold') return 6;
  return run.kind === 'peak' ? 1 : (r.axis === 'az' ? 0 : 3) + r.point;
}

// Readings that belong together: the search, one refine pass, or one step-track cycle.
export const groupOf = (r) => (r.stage === 'search' || r.stage === 'notfound' ? 'search' : r.stage === 'done' ? 'done' : `${r.pass ?? r.cycle}`);

const groupStart = (records, i) => {
  let s = i;
  while (s > 0 && groupOf(records[s - 1]) === groupOf(records[i])) s--;
  return s;
};

// Back to this group's start, or to the previous group if already there.
export function prevGroup(records, i) {
  const s = groupStart(records, i);
  return s < i || s === 0 ? s : groupStart(records, s - 1);
}

export function nextGroup(records, i) {
  for (let n = i + 1; n < records.length; n++) if (groupOf(records[n]) !== groupOf(records[i])) return n;
  return records.length - 1;
}

// First reading for a chip in the current group, otherwise in the nearest group that has one.
export function findChip(run, i, chip) {
  const { records } = run;
  const group = groupOf(records[i]);
  const same = records.findIndex((r) => groupOf(r) === group && chipFor(run, r) === chip);
  if (same >= 0) return same;
  // Auto-peak runs once, so a stage opens at its beginning. Step-track repeats, so stay in the nearest cycle.
  if (run.kind === 'peak') return records.findIndex((r) => chipFor(run, r) === chip);
  let nearest = -1;
  records.forEach((r, n) => {
    if (chipFor(run, r) === chip && (nearest < 0 || Math.abs(n - i) < Math.abs(nearest - i))) nearest = n;
  });
  if (nearest < 0) return -1;
  return records.findIndex((r) => groupOf(r) === groupOf(records[nearest]) && chipFor(run, r) === chip);
}
