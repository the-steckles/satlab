import { COLORS as C, prepare, ticks, verticalLabel } from '../../lib/plot.js';
import { MODCODS, throughputMbps } from '../../lib/modcods.js';
import { mountSuite, parseLesson, writeLesson } from '../../lib/suite.js';
import { analyzerLevels, ANALYZER_RBW_MHZ, bestModcod, buildReport, captureRangeMHz, CHECKS, ESCALATION, firstFault, modemState, REPORT_EXAMPLE, REPORT_FIELDS, STATE_NAMES, TICKETS } from './model.js';

const suite = mountSuite('troubleshoot', { jumps: [['lessonBox', 'Ticket'], ['specBox', 'Analyzer'], ['modemBox', 'Modem'], ['checkBox', 'Checklist']] });
const $ = (id) => document.getElementById(id);
const S = { mode: 'modem', ticket: 0, cfg: null, diagnosis: '', hint: false, solved: new Set() };

function drawAnalyzer(sig, cfg) {
  const { ctx, w, h } = prepare($('spectrum'));
  const m = { l: 50, r: 12, t: 14, b: 38 }, pw = w - m.l - m.r, ph = h - m.t - m.b, powered = cfg.lnbPower;
  const lo = Math.min(sig.freqMHz - sig.rsMsps * 1.6, cfg.freqMHz - cfg.rsMsps), hi = Math.max(sig.freqMHz + sig.rsMsps * 1.6, cfg.freqMHz + cfg.rsMsps);
  const { peakDbm, floorDbm } = analyzerLevels(sig), top = Math.ceil((peakDbm + 8) / 10) * 10, floor = Math.floor((floorDbm - 12) / 10) * 10 + 10;
  const X = (f) => m.l + ((f - lo) / (hi - lo)) * pw, Y = (v) => m.t + ((top - v) / (top - floor + 10)) * ph;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const v of ticks(floor - 10, top, 5).values) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.fillText(`${v}`, m.l - 5, y + 4); }
  ctx.textAlign = 'center';
  const fx = ticks(lo, hi, Math.max(3, Math.floor(pw / 90)));
  for (const f of fx.values) { const x = Math.round(X(f)) + 0.5; ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.fillText(`${+f.toFixed(2)}`, Math.max(m.l + 18, Math.min(m.l + pw - 18, x)), h - 22); }
  ctx.stroke();
  ctx.fillText('L-band frequency (MHz)', m.l + pw / 2, h - 6);
  verticalLabel(ctx, `dBm in ${ANALYZER_RBW_MHZ * 1000} kHz RBW`, 11, m.t + ph / 2);
  // The band the modem is searching.
  const capture = captureRangeMHz(cfg.rsMsps);
  ctx.fillStyle = 'rgba(95,125,240,.16)';
  ctx.fillRect(X(cfg.freqMHz - capture), m.t, X(cfg.freqMHz + capture) - X(cfg.freqMHz - capture), ph);
  ctx.strokeStyle = '#5f7df0';
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(X(cfg.freqMHz), m.t); ctx.lineTo(X(cfg.freqMHz), m.t + ph); ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
  ctx.strokeStyle = '#4fe0c0';
  ctx.beginPath();
  const a = 0.2, half = sig.rsMsps / 2;
  const seeded = (i) => { const x = Math.sin(i * 91.7 + 3.1) * 43758.5453; return x - Math.floor(x); };
  for (let px = 0; px <= pw; px += 2) {
    const d = Math.abs(lo + (px / pw) * (hi - lo) - sig.freqMHz);
    const shape = d <= half * (1 - a) ? 1 : d >= half * (1 + a) ? 0 : 0.5 * (1 + Math.cos((Math.PI / (2 * a * half)) * (d - half * (1 - a))));
    const base = powered ? floorDbm : floorDbm - 8; // A powered LNB raises the floor with its own amplified noise.
    const level = powered ? 10 * Math.log10(10 ** (base / 10) + shape * 10 ** (peakDbm / 10)) : base;
    const y = Y(level + 2.2 * (seeded(px) - 0.5));
    if (px) ctx.lineTo(m.l + px, y); else ctx.moveTo(m.l + px, y);
  }
  ctx.stroke();
  ctx.restore();
}

function renderModem() {
  const t = TICKETS[S.ticket], sig = t.signal, cfg = S.cfg, r = modemState(cfg, sig);
  const first = firstFault(t), best = bestModcod(sig.esN0Db, sig.rsMsps), rightDiagnosis = S.diagnosis === first, bestRate = first !== 'quality' || cfg.modcod === best;
  const solved = r.state === 'locked' && rightDiagnosis && bestRate;
  if (solved) S.solved.add(S.ticket);
  const lockedNote = !S.diagnosis ? 'Locked, but no diagnosis was recorded first. Restart this ticket and choose your diagnosis before you fix it.'
    : !rightDiagnosis ? 'Locked, but that diagnosis is not what stopped this modem first. Restart the ticket and watch which check fails.'
    : !bestRate ? `Locked, but this gives up throughput. ${best} is the fastest MODCOD that keeps 1 dB of margin, at ${throughputMbps(best, sig.rsMsps).toFixed(1)} Mbit/s against ${throughputMbps(cfg.modcod, sig.rsMsps).toFixed(1)}.`
    : `Solved. ${t.fixed}`;
  $('lessonTitle').textContent = `Ticket ${S.ticket + 1}: ${t.title}`;
  suite.text($('lessonText'), r.state === 'locked' ? lockedNote : t.story);
  suite.related(null, false);
  $('diagnosis').value = S.diagnosis;
  if (r.state === 'locked') S.diagnosisFrozen = true; // Committed before the fix, and undoing the fix does not reopen it.
  $('diagnosis').disabled = !!S.diagnosisFrozen;
  $('lessonPos').textContent = `${S.ticket + 1} of ${TICKETS.length}, ${S.solved.size} solved`;
  $('lessonBack').disabled = S.ticket === 0;
  $('lessonNext').disabled = S.ticket === TICKETS.length - 1;
  $('modemState').textContent = STATE_NAMES[r.state];
  $('modemState').className = r.state === 'locked' ? 'good' : r.state === 'fecFail' ? 'warn' : 'bad';
  suite.spotlight(r.state === 'locked' ? [] : t.show); // After the class reset above. Evidence the story mentions, never the fix.
  for (const [id, value] of [['lnbPower', cfg.lnbPower], ['inverted', cfg.inverted]]) $(id).checked = value;
  for (const [id, value] of [['freqMHz', cfg.freqMHz], ['rsMsps', cfg.rsMsps]]) if (document.activeElement !== $(id)) $(id).value = value;
  const demod = r.state === 'locked' || r.state === 'fecFail';
  $('mModcod').textContent = demod ? cfg.modcod : 'needs demod lock';
  $('requestModcod').disabled = $('sendRequest').disabled = !demod;
  if (document.activeElement !== $('requestModcod')) $('requestModcod').value = cfg.modcod;
  const set = { sRf: `${sig.rfMHz} MHz`, sLo: `${sig.loMHz} MHz` };
  for (const [id, text] of Object.entries(set)) $(id).textContent = text;
  const on = cfg.lnbPower;
  $('mCenter').textContent = on ? `${+sig.freqMHz.toFixed(2)} MHz` : 'no carrier';
  $('mWidth').textContent = on ? `${sig.rsMsps.toFixed(1)} MHz` : '–';
  $('mLevel').textContent = on ? `${sig.levelDbm.toFixed(1).replace('-', '−')} dBm` : '–';
  $('mEs').textContent = r.state === 'locked' || r.state === 'fecFail' ? `${sig.esN0Db.toFixed(1)} dB` : 'needs demod lock';
  $('mNeed').textContent = demod ? `${MODCODS[cfg.modcod].toFixed(1)} dB` : 'needs demod lock';
  $('checks').replaceChildren(...CHECKS.map(([id, name, question]) => {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = name;
    li.append(b, ` ${question}`);
    if (S.hint && r.failing === id) li.className = 'fail';
    return li;
  }));
  $('hint').textContent = S.hint ? 'Hide hint' : 'Show which check fails';
  drawAnalyzer(sig, cfg);
}

function renderReport() {
  const values = Object.fromEntries(REPORT_FIELDS.map(([id]) => [id, $(`f-${id}`).value]));
  const r = buildReport(values);
  $('reportText').textContent = r.text;
  const problems = [r.missing.length ? `Still needed: ${r.missing.join(', ')}.` : '', r.invalid.length ? `Check the format of: ${r.invalid.join(', ')}.` : '', r.warning].filter(Boolean).join(' ');
  $('reportMissing').textContent = problems || 'All required fields are filled in.';
  $('reportMissing').className = problems ? 'note warn' : 'note good';
}

function setMode(mode) {
  S.mode = mode;
  for (const [id, m] of [['modeModem', 'modem'], ['modeReport', 'report']]) { $(id).classList.toggle('active', mode === m); $(id).setAttribute('aria-pressed', mode === m); }
  $('modemView').hidden = mode !== 'modem';
  $('reportView').hidden = mode !== 'report';
  document.querySelector('.suiteJump').hidden = mode === 'report'; // Its targets are all in the modem view.
  if (mode === 'modem') renderModem(); else renderReport();
}

function applyTicket(i) {
  S.ticket = i;
  document.activeElement?.blur?.(); // A focused field would otherwise keep showing the old value.
  S.cfg = { ...TICKETS[i].start };
  S.diagnosis = '';
  S.diagnosisFrozen = false;
  S.hint = false;
  writeLesson(i);
  renderModem();
}

function wire() {
  $('requestModcod').append(...Object.entries(MODCODS).map(([name, v]) => new Option(`${name} (${v.toFixed(1)} dB)`, name)));
  $('diagnosis').append(new Option('Choose a check', ''), ...CHECKS.map(([id, name]) => new Option(name, id)));
  $('diagnosis').addEventListener('change', (e) => { S.diagnosis = e.target.value; renderModem(); });
  for (const id of ['lnbPower', 'inverted']) $(id).addEventListener('change', (e) => { S.cfg[id] = e.target.checked; renderModem(); });
  for (const id of ['freqMHz', 'rsMsps']) $(id).addEventListener('change', (e) => {
    const v = +e.target.value;
    if (e.target.value === '' || !Number.isFinite(v) || v < +e.target.min || v > +e.target.max) { e.target.value = S.cfg[id]; return; }
    S.cfg[id] = v;
    renderModem();
  });
  $('sendRequest').addEventListener('click', () => { S.cfg.modcod = $('requestModcod').value; renderModem(); });
  $('hint').addEventListener('click', () => { S.hint = !S.hint; renderModem(); });
  $('restart').addEventListener('click', () => applyTicket(S.ticket));
  $('lessonBack').addEventListener('click', () => applyTicket(S.ticket - 1));
  $('lessonNext').addEventListener('click', () => applyTicket(S.ticket + 1));
  $('modeModem').addEventListener('click', () => setMode('modem'));
  $('modeReport').addEventListener('click', () => setMode('report'));
  $('reportFields').append(...REPORT_FIELDS.map(([id, label, required, placeholder]) => {
    const wrap = document.createElement('label'), input = document.createElement('input');
    input.id = `f-${id}`;
    input.autocomplete = 'off';
    input.placeholder = placeholder;
    input.addEventListener('input', renderReport);
    wrap.append(`${label}${required ? ' *' : ''}`, input);
    return wrap;
  }));
  $('useNow').addEventListener('click', () => { $('f-start').value = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`; renderReport(); });
  $('copyReport').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('reportText').textContent); $('copyNote').textContent = 'Copied.'; }
    catch {
      const range = document.createRange();
      range.selectNodeContents($('reportText'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      $('copyNote').textContent = 'Copying was blocked, so the text is selected. Press Ctrl+C.';
    }
  });
  $('fillExample').addEventListener('click', () => { if (REPORT_FIELDS.some(([id]) => $(`f-${id}`).value.trim()) && !confirm('Replace what you typed with the example?')) return; for (const [id] of REPORT_FIELDS) $(`f-${id}`).value = REPORT_EXAMPLE[id] ?? ''; renderReport(); });
  $('clearReport').addEventListener('click', () => { if (!confirm('Clear every field in this report?')) return; for (const [id] of REPORT_FIELDS) $(`f-${id}`).value = ''; $('copyNote').textContent = ''; renderReport(); });
  $('escalation').append(...ESCALATION.map(([title, text]) => {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = title;
    li.append(b, ` ${text}`);
    return li;
  }));
  window.addEventListener('resize', () => { if (S.mode === 'modem') renderModem(); });
}

wire();
applyTicket(parseLesson(location.search, TICKETS.length));
setMode('modem');
