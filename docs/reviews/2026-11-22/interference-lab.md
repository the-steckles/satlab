## Verdict
Interference Lab has a strong skeleton: test points, two-site comparison and live numbers are the right way to teach this. It is not yet trustworthy as a diagnostic trainer. Several readouts contradict the plots or the physics, and all five tickets can be solved from the table without looking at a spectrum, waterfall or IQ plot.

## Confirmed findings (reproduced)

**1. Critical: the "noise floor" readout ignores visible interference.**
- Did: ran wideband at -7 dBc, uplink and downlink (Lesson 5).
- Saw: the plot rises about 3.0 dB mid-transponder, while the table says 0.0 dB. The lesson text says "raised noise floor".
- Why: this is the row learners use to separate causes.
- Fix: report measured floor including interference, or rename the row "Thermal noise" and add "Measured floor". `model.js:95`, `lessons.js:27`

**2. Critical: Diagnose does not require spectrum skills.**
- Did: scored tickets with a five-branch rule using only the site table.
- Saw: 20/20 across shuffled runs. There is one fixed instance per cause, a generic ticket text, no CW/modulated/swept identification, and no score or end state.
- Fix: add variants that need the plots: wideband vs tone, intermittent sweep, same-table/different-cause pairs, a no-fault case, and a customer story. Ask for the evidence and the next action. `model.js:208`, `main.js:147`

**3. Critical: backoff and saturation are miscalibrated.**
- Did: swept input backoff.
- Saw: 3 dB IBO gives 4.7 dB OBO; 0 dB IBO gives 2.96 dB OBO. C/IM at "saturation" is 19.9 dB.
- Why: a compressive TWTA has OBO below IBO, and 0 IBO should mean 0 OBO. Two-carrier C/IM near saturation is typically nearer 10-14 dB, so overdrive looks far too benign.
- Fix: normalize the transfer curve to a true saturation point, ideally with a TWTA-like curve. `model.js:68`, `model.js:8`

**4. Major: tone height misleads.**
- Did: measured the CW peak against its set level.
- Saw: -15 dBc plots at +2.0 dB and -7 dBc at +9.8 dB on an axis labeled "dB relative to clear-sky carrier". RBW is never shown.
- Why: a tech will read a tone below the carrier as stronger than it.
- Fix: label the axis as PSD, show RBW (about 100 kHz), and add a marker comparing tone power with integrated carrier power. Teach this in Lesson 2. `plots.js:34`, `model.js:164`

**5. Major: the other carrier uses your MODCOD.**
- Did: put interference on the other carrier and changed only my MODCOD.
- Saw: its Es/N0 stayed 6.37 dB, but it flipped Lost to Locked when I chose QPSK.
- Fix: give it an independent MODCOD. `model.js:117`

**6. Major: in-band impact has a brick-wall edge.**
- Did: moved a 0 dBc tone across the carrier edge.
- Saw: Es/N0 jumps from -0.15 dB at 2.50 MHz offset to 14.45 dB at 2.51 MHz, still inside the shaded 6 MHz carrier.
- Fix: weight interference by the matched-filter response, about -3 dB at Rs/2 and rolling off to the 1.2 Rs edge. `model.js:51`, `model.js:84`

**7. Major: power robbing has no tone-vs-modulated behavior.**
- Did: applied +10 dBc as CW, narrowband, swept, partial and wideband.
- Saw: identical 4.24 dB robbing. Moving the tone did not change the neighbor's Es/N0 either.
- Correct: limiter theory gives weak-signal suppression approaching 6 dB against a dominant tone and about 1 dB against a dominant noise-like signal. IM products are also frequency-specific.
- Fix: model the suppression, or state the simplification plainly. Show discrete IM as a recognition signature. `model.js:82`, `model.js:125`

**8. Major: Lesson 9 gives an incomplete cause.**
- Saw: it blames the fixed downlink noise, but C/IM also falls from 23.7 to 15.5 dB and contributes materially to the drop to 10.7 dB.
- Fix: show a C/N up, C/N down, C/IM and C/I breakdown. The model already computes these. `lessons.js:43`, `model.js:93`

**9. Major: signal types and IQ are not taught.**
- Saw: no lesson explains the IQ plot, MER, or modulated narrowband. Partial-band appears unexplained in Lesson 13. At 16APSK and -8 dBc, CW and narrowband IQ look essentially alike. The swept "diagonal track" is sparse dots that vanish across the carrier.
- Fix: add a signature lesson using QPSK, with side-by-side spectrum, waterfall and IQ. Make the sweep trace continuous. `lessons.js`, `model.js:190`

**10. Major: ALC is shown only as harm.**
- Saw: Lesson 10 margin is -1.2 dB with ALC vs +0.5 dB without, with no explanation. ALC's benefit exists in the model: at a 5 dB uplink fade, Es/N0 is 13.5 dB vs 11.7 dB. ALC range is also unlimited.
- Fix: add the fade case and a finite ALC range. `model.js:67`, `lessons.js:47`

**11. Minor.**
- "Level relative to carrier" is relative to nominal: -10 dB with trim -10 gives actual C/I 0 dB (`model.js:62`).
- Carriers extending beyond the transponder take no filter penalty (`model.js:74`).
- Lessons and tickets say to check a beacon, but the lab has no beacon.
- MODCOD changes show no throughput, so "trading throughput for margin" is not visible.
- Sandbox hides the swept lock percentage (`main.js:43`).
- Phone has no overflow, but controls sit far below the lesson that asks you to use them.

## Opinions
- Define Es/N0, C/I, C/(N+I), MER, IBO/OBO and MODCOD on first use with tap-to-define labels.
- Lessons mostly tell the learner what happened. Ask for a prediction before revealing each change.
- "Lost" conflates demod lock with FEC failure. Techs do see "locked but errored".
- Mispointing should mention adjacent-satellite interference. Cross-pol deserves a scenario.

## Unanswered questions
1. "Why does a tone below my carrier look taller than my carrier?"
2. "How do I tell CW from modulated interference on my analyzer and constellation?"
3. "If the floor visibly came up, why does the table say 0.0?"
4. "What backoff should I actually run, and how do I know I'm overdriven?"
5. "If ALC made my carrier worse, why would anyone turn it on?"
6. "How do I tell uplink interference from a problem at our own transmit site?"
7. "Could this be adjacent satellite or cross-pol, and what would that look like?"
8. "How much throughput do I lose if I drop MODCOD to survive this?"
9. "What exactly do I put in the interference report, and who do I call first?"
10. "What does the beacon tell me that Es/N0 doesn't?"

## What works well and must not be kept from learners
- Four test points: satellite input, transponder output, Site A and Site B.
- Site A/B comparison as the primary localization habit.
- Lesson text driven by live model values.
- Correct DVB-S2 QEF thresholds and the core C/(N+I) combination.
- The defensive framing: relative levels, a fictional satellite, and a response path ending in reporting.

## Could not test
- Real-hardware or real-signal comparison.
- Physical phone touch behavior (emulated at 390x844 only).
- Screen-reader use.
- CW ring visibility across every MODCOD; I inspected the default 16APSK.
- The preview serves a bundle, so numeric probes imported the repo source. Key values matched the live UI.


Risk: the C/IM and limiter-suppression figures are textbook ranges, not measurements of a specific TWTA.
