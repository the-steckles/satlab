# SatLab independent review, round 2

Seven independent reviewers checked the uncommitted pass 3 build on 2026-11-22. All seven recommended fixes before shipping. Their full reports are in this folder:

- [Peaker](peaker.md)
- [Mixer Lab](mixer-lab.md)
- [Link Budget Lab](link-budget-lab.md)
- [Interference Lab](interference-lab.md)
- [DVB-S2 Overlay Lab](dvbs2-lab.md)
- [Field Troubleshooter](field-troubleshooter.md)
- [Whole suite](suite.md)

Limits: no real hardware, real phones or screen readers. The Peaker review's final run was stopped by low system memory, so its LEO, phone and part of its 600× review checks are unverified. Physics was judged from theory and domain knowledge.

## Status

The must-fix and should-fix items below were approved and fixed. All seven reviewers then re-checked the build, and their follow-up findings were fixed too. The last small text and validation edits were checked by tests and a scripted browser walk, not by a further reviewer pass.

Known and left open:

- Interference: the Other carrier row does not show Reacquiring, and each Diagnose cause has one evidence answer.
- Mixer: the TWTA plot has no Psat line or IBO and OBO markers.
- Troubleshooter: throughput ignores framing overhead, and the analyzer scale changes between tickets.
- Link Budget still imports Peaker's antenna and path-loss code.
- SatLab-1 and the TWTA are not unified across labs. Their differences are stated on screen.
- Not tested on real hardware, real phones or screen readers.

## Fixes as proposed

### Must fix before shipping

| Area | Finding | Proposed fix |
|---|---|---|
| Suite | Labs teach different lock rules | One shared receiver rule, with a MODCOD-independent demod threshold and FEC failure in every lab |
| DVB-S2 | Hysteresis and other lesson text is false on some MODCODs | Text follows the receiver state, or the lesson sets its own MODCOD |
| DVB-S2 | Monitoring shows simulator truth and says Normal with MER down 7 dB | Separate truth from measurements and add a MER alarm |
| Troubleshooter | MODCOD is treated as a receiver setting | Show it as detected from the PLHEADER, with a request to the transmit side |
| Troubleshooter | Search band can contradict the modem | Use one capture calculation |
| Link Budget | A lone carrier is told to overdrive | Add a nonlinear penalty and never report a plot edge as the best point |
| Link Budget | Other carriers move with yours | Hold neighbor flux fixed and show power robbing |
| Link Budget | Pointing loss has no floor, and rain margin collapses | Use Peaker's antenna pattern and evaluate margin from clear sky |
| Interference | Diagnose can be scored 10/10 without a plot | Randomize tickets, add same-table pairs and ask for evidence |
| Interference | Repeaking does not reduce adjacent-satellite interference | Tie it to antenna discrimination |
| Interference | Cross-pol, floor and backoff readings are inconsistent | Derive them from stated isolation, split the floor reading, define the control |
| Mixer | Lesson text is false at other test points | Compute lesson text from named test points |
| Mixer | TWTA OBO goes negative, and detuned filters hide noise | Count only in-zone products and shape the arriving noise |
| Peaker | Guide finishes without teaching tracking | Require a visible fixed-versus-tracked divergence or step-track |
| Peaker | Fixed-dish reference and status text can mislead | Reference only a confirmed peak and clear stale status |
| Peaker | Fixed-mount advice understates loss | Use peak-to-peak excursion |

### Should fix

- Use one SatLab-1 baseline and one TWTA reference across labs, or state the difference on screen.
- Correct both end-of-lab handoffs, make the glossary Close button stay visible, and add missing core terms.
- Teach IQ before Interference relies on it.
- Teach the analyzer's (C+N)/N reading, two-tone compression and a lobe test that does not rely on a trusted expected level.
- Improve the report fields, escalation order and analyzer safety guidance, including a DC block.
- Use a C-band 5150 MHz LNB as the high-side example.
- Tighten the wording on what authentication and capture do and do not mean.
- Update ROADMAP and README, and commit the new lab folders together with `vite.config.js`.
