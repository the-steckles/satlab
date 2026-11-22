# SatLab whole-suite review

**Verdict:** These are four strong individual labs, but they do not yet work as a curriculum. Nothing states the order or links one lab to another. Where labs share a concept, they sometimes teach conflicting behavior, most seriously on transponder limits and receiver lock.

## Confirmed findings (reproduced in the browser)

**1. Critical: the "Near the cliff" lesson shows a link that has already fallen off.**
- Did: DVB-S2 lesson 4.
- Saw: Es/N0 6.5 dB, need 6.6, receiver **Searching**, following None. The text says "about −0.1 dB from the limit... any further rise will break the picture."
- Why: it undercuts the suite's core margin concept.
- Fix: use about −8 dB overlay (calculated 7.4 dB Es/N0, +0.8 margin) and phrase margin consistently.
- `dvbs2/src/lessons.js:18-19`

**2. Critical: Interference and DVB-S2 disagree on what a strong second signal does to the transponder.**
- Did: applied a +10 dB second uplink in each lab.
- Saw: Interference output rises only 3.5 dB (4.7 to 1.2 dB below saturation) and carriers fall 4.2 dB. DVB-S2 monitoring reports **+10.4 dB** total level, with no compression or power robbing.
- Why: a tech learns a monitoring signature that the previous lab's physics rules out.
- Fix: state where DVB-S2 measures and that it assumes a linear path, or show the compressed level and carrier drop as a detection signature. Do not add capture-threshold tuning.
- `dvbs2/src/model.js:22,95`; `interference/src/model.js:68`

**3. Major: backoff values run backwards from field convention.**
- Saw: default IBO 3.0 dB gives "output is 4.7 dB below saturation." A compressive amplifier should have OBO smaller than IBO. The soft limiter reaches only half power at 0 dB IBO.
- Lesson 9 also says total output "stays about the same" while its own readout rises 3.5 dB.
- Fix: reference IBO to the real saturation point, then re-check the lesson text.
- `interference/src/model.js:58,68`; `interference/src/lessons.js:43`

**4. Major: lock behavior contradicts between labs.**
- Did: dropped below threshold, then returned just above it.
- Saw: Interference relocks within 200 ms (+0.2 dB, Marginal). DVB-S2 is still **Searching** after 4 s at 6.9 dB, as its hysteresis lesson teaches.
- Interference's "usable about 85%" for swept interference ignores reacquisition, which DVB-S2 models at about 2.8 s.
- Fix: relabel as "above threshold 85% of the time" and note that relock takes longer. No sweep optimization needed.
- `interference/src/model.js:99,134`; `dvbs2/src/model.js:13-14,43`

**5. Major: no learning path and no cross-links.**
- Saw: the landing page is an unnumbered list with no prerequisites. Every lab's only internal link is back to `/`. The rationale exists only in `docs/ROADMAP.md` ("Each tool sets up the next").
- Fix: number the cards, add one "builds on" line each, and add "Next lab" links at lesson ends.
- `index.html:29-42`

**6. Major: Interference tells learners to check a beacon that does not exist there.**
- Saw: lesson 11 and the rain and mispoint ticket explanations say to check the beacon. The lab has no beacon readout, so the Diagnose tickets cannot use the step.
- Fix: add a Site A/B beacon-level row. It is also the natural Peaker bridge.
- `interference/src/lessons.js:51`; `interference/src/model.js:211,215`

**7. Major: the Mixer "full link" loses the carrier in the last scene.**
- Saw: 1200 + 13050 = 14250, then 14250 − 1750 = 12500, then 12500. Ground downlink restarts at **12000**.
- Fix: default Ground downlink to 12500 (IF 1750), which also matches Interference's center.
- `mixers/src/model.js:55`

**8. Major: progress is fragile, and Peaker has no guided path.**
- Saw: returning to any lab resets lessons to 1, and a Mixer scene round trip took lesson 5 back to 1. Nothing in the URL identifies a lesson, so nobody can link to one. Peaker has no numbered sequence or objective, and on a phone its guide starts at 1612 of 3626 px, versus near the top elsewhere.
- Fix: add `?lesson=` deep links, which cross-links need anyway, and a short Peaker sequence.

**9. Minor: vocabulary and scenario drift.**
- The same "margin under 1 dB" state is **Marginal** in Interference and **Degraded** in DVB-S2; **Lost** versus **Signal lost**.
- "Link C/N" (DVB-S2) feeds "Es/N0" readouts, and Peaker shows "C/N in tracking BW." No lab relates them.
- SatLab-1 is 16APSK 3/4 at 15.3 dB in one lab and 8PSK 2/3 at 16.0 dB in the other. MODCOD lists are 6 versus 4 entries.
- Reset is "Reset scene," "Reset sandbox," "Restart," or absent in Peaker.

**10. Minor: duplication that can cause real drift.**
- MODCOD thresholds are defined twice (`interference/src/model.js:11`, `dvbs2/src/model.js:6`). Share that table and the state labels. Leave the lesson players and CSS alone for now.
- Release risk: `dvbs2/` and `lib/constellation.js` are untracked, while modified tracked files depend on them. Commit them together.

## Opinions
- Interference should use the words P1dB and compression at power robbing, so Mixer knowledge transfers.
- Pink as "unwanted signal" is a good convention. Make it explicit across labs.

## Recommended order and cross-links
**Order:** Peaker → Mixer Bench → Mixer link scenes → Interference guided → Interference Diagnose → DVB-S2.

1. Mixer "Compression and saturation" and the TWTA scene → Interference "Power robbing"
2. Peaker beacon → Interference "Rain is not interference" and Diagnose
3. Interference "Interference adds to noise" and "The cliff" → DVB-S2 "A second signal appears"
4. Mixer "High-side LO flips the spectrum" → DVB-S2 Demodulator block
5. DVB-S2 "Why it stays captured" → Interference "Swept interference"

## Unanswered learner questions
1. "What's the difference between C/N, Es/N0, Eb/N0 and MER, and which do I trust?"
2. "How much pointing error costs me how much Es/N0 margin?"
3. "Where does my 15 dB Es/N0 come from?" (EIRP, path loss and G/T are never worked end to end.)
4. "If IBO is 3 dB, what should OBO be?"
5. "After the interference clears, how long until my modem comes back?"
6. "How do I tell cross-pol or adjacent-satellite interference from everything else?" (Named, not simulated.)
7. "What does LO phase noise or drift do to my constellation?"
8. "My carrier won't lock. Is it inversion, frequency offset, symbol rate or level?"
9. "How do I set polarization skew, and how do I know it's right?"
10. "Which MODCOD should I pick, and what throughput do I give up?"

## What works well and must not be lost
- Lessons written from live model values.
- Mixer's signal chain with selectable test points.
- Interference's two-site comparison and Diagnose tickets.
- DVB-S2's visible lock sequence and hysteresis.
- Clear defensive boundaries: fictional satellites, relative levels, no transmit path.

## What I could not test
- Live third-party data (bundled fallback only), real phones or touch feel, and screen readers.
- Peaker's auto-peak and step-track in depth, and every Diagnose ticket.
- I did not run the build or test suite, so the partial-commit risk comes from reading imports and git status.
- Physics was checked for cross-lab consistency, not validated against measured equipment.
