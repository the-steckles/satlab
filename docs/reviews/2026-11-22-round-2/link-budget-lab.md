# Link Budget Lab review

## Verdict
The budget arithmetic is correct, and the structure is the right way to teach it. I would not ship it as is: the backoff tool tells a single-carrier user to overdrive the transponder, shared-transponder behavior is wrong when only your carrier changes, and the analyzer guidance is misleading. These are contained fixes.

## Hand recomputation (reproduced)
I recomputed three cases outside the app: default, 4 dB downlink rain, and 60 W/3 other carriers/3 dB uplink rain. **Every compared line matched within display rounding (worst 0.05 dB).**

Default, hand vs app:

| Line | Hand | App |
|---|---|---|
| Uplink EIRP | 65.05 | 65.0 |
| Uplink FSPL | 207.16 | 207.2 |
| IBO | 6.78 | 6.8 |
| OBO | 2.42 | 2.4 |
| Carrier EIRP | 44.57 | 44.6 |
| G/T | 21.75 | 21.8 |
| Uplink C/N0 | 89.27 | 89.3 |
| Downlink C/N0 | 88.69 | 88.7 |
| C/IM0 | 91.55 | 91.6 |
| Total C/N0 | 84.90 | 84.9 |
| Es/N0 | 17.91 | 17.9 |
| C/N | 17.12 | 17.1 |
| Eb/N0 | 13.14 | 13.1 |
| MER | 17.51 | 17.5 |
| Margin | 7.70 | 7.7 |

- Spreading loss (162.63 dB) is correct and feeds the flux and IBO lines.
- Rain noise is correct: 4 dB gives 276 K.
- Backoff-curve Es/N0 and OBO matched at 7 sampled points.
- The 1 dB pointing formula is correct: 0.289 × beamwidth = 0.37°.
- This confirms the arithmetic. It used the app's antenna efficiency, C/IM law and TWTA curve, whose limits are covered below.

## Findings: reproduced

**1. Critical: a lone carrier is told to overdrive.** Set Other carriers = 0, HPA = 400 W. The app shows IBO −3.2 dB, green "Link closes", 16.3 dB margin, 32APSK recommended, and "Best Es/N0 is 26.3 dB at −2.0 dB." The "best" is just the plot's left edge. Single-carrier nonlinear distortion is not modeled, so uplink C/N0 keeps improving past saturation. Real 16/32APSK needs backoff or predistortion.
Fix: add a MODCOD-dependent nonlinear penalty, and flag IBO < 0 as overdriven. Never report a plot edge as an optimum. `model.js:57,111`

**2. Major: other carriers move with yours.** HPA, dish, pointing and uplink rain scale every carrier, because total flux is always this carrier + `shareDb`. I compared this against holding the neighbors fixed, using the same TWTA curve:
- 5 others, your carrier +6 dB: EIRP 42.2 (app) vs 46.5 dBW.
- 5 others, 6 dB uplink fade at your site: IBO 8.0 (app) vs 2.6 dB; EIRP 39.0 vs 36.4 dBW.
- 1 other, 6 dB fade: app IBO rises to 12.8, so C/IM *improves* from 24.6 to 36.6 dB. A fade on one carrier should not clean up its IM.
- Power robbing, the key shared-transponder lesson, is invisible.

Fix: hold neighbor flux fixed, and show the neighbor's EIRP change. `model.js:40-46,108`

**3. Major: analyzer guidance is wrong for the usual measurement.** Lesson 8 says the 17.1 dB C/N is "close to what an analyzer shows." A marker delta from carrier top to noise floor reads (C+N)/N, about 18.0 dB here, which tracks Es/N0 rather than C/N in 1.2×Rs. High confidence.
Fix: teach the delta reading, the (C+N)/N correction, and that 17.1 applies only to integrated channel power. `lessons.js:43`

**4. Major: pointing loss has no floor.** A 9 m receive dish at 1.5° shows −908 dB pointing loss and Es/N0 −869.7 dB. A 13 m transmit dish at 0.4° shows IBO 172 dB. The parabola is used far beyond its stated range.
Fix: reuse Peaker's `gainDbi` pattern. `model.js:28,35,50`

**5. Major: "Downlink rain it survives" collapses to 0.** In the Rain step, set rain to 8 dB. The panel says 0.0 dB while the lesson beside it says 6.4 dB. The tolerance is searched from the current rain state.
Fix: evaluate with `downRainDb: 0`. `model.js:88,97`

**6. Major: backoff lesson contradicts its plot.** It says "uplink and downlink quality flatten near saturation." Uplink is a straight line: 76.3 to 102.3 dB-Hz from 1 W to 400 W. Only downlink flattens. `lessons.js:56`

**7. Minor: operating marker disappears.** At 1 W (IBO 19.8) and 400 W (IBO −3.2) the dashed "this link" line is off the fixed −2 to 18 dB axis. Extend the axis or pin an off-scale indicator. `main.js:106,134`

**8. Minor: Next silently discards experiments.** With a 2.4 m dish, Next returned to 1.2 m and Es/N0 fell from 19.5 to 17.9 dB. Say that the step loads its own setup, or offer to keep changes. `main.js:199`

**9. Minor: phone sliders are far from results.** At 390 px, with a slider centered, the result, ladder and backoff plot are all off-screen. Add a compact sticky Es/N0 and margin readout.

**10. Minor: ladder label collision.** At 1 W, "−173.1" overlaps "At dish." `main.js:87-90`

## Findings: technical judgment, not reproduced as bugs
- **Minor:** low elevation adds path and atmospheric loss but no sky noise. At 5°, about 1.4 dB of atmosphere should add roughly 65 K, or about 2 dB of G/T. Medium confidence.
- **Minor:** C/IM does not depend on carrier count except through drive, so six carriers are probably optimistic. Medium confidence.
- **Minor:** 30 Msym/s with 5 other carriers implies 216 MHz occupied, with no transponder-bandwidth check or warning.

## Earlier findings
There is no earlier report for this lab. Against the README questions:
- Q1, C/N vs Es/N0 vs Eb/N0 vs MER: **partly answered** (finding 3).
- Q2, where Es/N0 comes from: **answered**.
- Q3, pointing tolerance: **answered near peak**, breaks at large errors (finding 4).
- Q5, what backoff and how to recognize overdrive: **partly answered** (findings 1, 2, 6).

## Unanswered questions
1. If I raise my carrier, what happens to my neighbors?
2. Is my transponder power-limited or bandwidth-limited?
3. How much backoff does each MODCOD need?
4. How do I convert an analyzer reading to Es/N0?
5. Why does measured MER differ from Es/N0 on a real modem?
6. How do gain step or ALC change SFD?
7. How does uplink power control respond to a fade?
8. How do C-band and Ka-band change this budget?

## What works well
- The level ladder paired with the live budget table.
- Reciprocal C/N0 combination, with the limiting term named.
- Rain modeled as both fade and added noise.
- Lesson text driven by live values.
- Correct DVB-S2 thresholds and a clearly labeled fictional satellite.

## Could not test
Real modem or analyzer behavior, or a measured TWTA. Keyboard and screen-reader use were not exercised. Phone was checked in emulation at 390 px only.
