# Peaker independent review

## Verdict
Peaker has a strong core: the pause and step-through controller review with real readings is excellent teaching. It is not yet trustworthy as an instrument lesson, because it can report "Peaked" on pure noise, its analyzer can hide a strong beacon, and its default "geostationary" satellite is 3.4° inclined without saying so. It also gives a learner no guided path from mispointed to peaked.

## Confirmed findings (reproduced)

**1. Critical: Auto-peak reports success with no satellite in the search area.**
- Did: stepped about 12.7° off, outside the 3.46° search radius, and ran Auto-peak.
- Saw: green "Peaked." at 14.03° off, C/N 2.9 dB. In 2,000 noise-only runs of the lab's controller, 99.7% "peaked".
- Why: the best of 311 single noise samples nearly always clears the +6 dB threshold, so "No beacon found" almost never fires. The text also says "Small final moves mean the fit has converged" directly after reporting moves clipped at the limit.
- Fix: set the threshold for the maximum of N samples (about 11 dB or more), re-dwell to confirm the candidate, and compare the result with expected level. Do not say "Peaked" if a fit is clipped or the level is well below expected.
- Where: `peaker/src/track.js:119`, `peaker/src/main.js:468`, `peaker/src/explain.js:115`.

**2. Critical: Narrow RBW makes an on-peak beacon vanish.**
- Did: peaked at -113.9 dBm, then set RBW to 300 Hz at 1 MHz span, and 10 Hz at 1000 MHz span.
- Saw: marker read -149.7 dBm and -164.8 dBm, with no visible carrier, while Beacon Level stayed at -113.9.
- Why: 801 bins are about 1.25 kHz apart at 1 MHz span, so a narrow Gaussian falls between bins. A tech would conclude the beacon is gone. Sweep rate also stays 30/s, whereas 10 Hz RBW over 1 GHz would really take on the order of 10^7 s.
- Fix: use peak detection per bin or couple RBW to span, and show sweep time plus an "uncalibrated" warning.
- Where: `peaker/src/link.js:44-60`, `SWEEP_S` in `peaker/src/main.js:12`.

**3. Major: The default satellite is inclined but labeled "Geostationary".**
- Did: propagated the bundled Galaxy 17 elements for 24 h from Washington.
- Saw: inclination 3.36°, elevation 40.55° to 47.91°, against a 0.69° beam. A fixed dish lost 9.8 dB after 3 h in my test window. Of 581 satellites labeled geostationary, 210 exceed 1°.
- Why: this is the reason step-track exists, yet the lab hides it and turns Program track off.
- Fix: show "Inclined GEO (3.36°)", plot the daily figure-8, and set the Program track default by inclination.
- Where: `peaker/src/orbit.js:5`, `peaker/src/main.js:85,95`.

**4. Major: Step-track's purpose cannot be observed.**
- Peak drift is 0.0164°/min, so a quarter-beam takes about 10.5 min. There is no time acceleration (`simDate`, `peaker/src/main.js:41`), and the longest history window is 10 min.
- Fix: add 60x/600x time and a side-by-side "fixed vs tracking" level trace.

**5. Major: The fit explanation calls a valley a peak.**
- Did: ran Step-track from a side-lobe region at 1.12° off.
- Saw: an upward-curving elevation plot labeled "peak at -0.173°", and text saying "The parabola... peaks".
- Fix: detect positive curvature and say "No peak between these points; stepping toward the stronger side."
- Where: `peaker/src/track.js:13`, `peaker/src/explain.js:43`, explainer plot in `peaker/src/display.js`.

**6. Major: The waterfall mixes incompatible settings under one axis.**
- Did: changed span and RBW.
- Saw: older rows stayed under the new frequency labels, so the beacon appeared at different frequencies. There is no color scale or time scale.
- Fix: clear or mark rows on retune, and add a dBm color bar and time ticks.
- Where: `peaker/src/main.js:412`.

**7. Major: "C/N" is actually (C+N)/N, computed from a noisy level.**
- Saw: -2.1 to +2.9 dB with no usable carrier. Tracking bandwidth (3 kHz) is never shown.
- Fix: estimate C/N as (C+N)/N minus 1 in linear terms, show "<0 dB / not detected", and label "C/N in 3 kHz".
- Where: `peaker/src/main.js:499`.

**8. Minor: Step-track keeps moving after "Track lost."**
- It continues cycling on noise and wandering. Real controllers normally inhibit motion below threshold.
- Where: `peaker/src/track.js:169-186`.

**9. Minor: Phone order separates action from effect.**
- No horizontal overflow, and the sticky dock helps. But Auto-peak is about 2,150 px below the spectrum, and the dock has no Auto-peak or Pause.

## Opinions

- **Major: No guided first task.** The lab opens on a noise trace with 40+ controls. Add a short path: predict, find, confirm main lobe, peak, track.
- **Major: Terms are undefined at point of use.** These include beacon, RBW, dBi, side lobe, S.580, program track, step-track and tracking BW.
- **Major: Polarization is missing from the workflow.** Skew is excluded only in the README (`peaker/README.md:40`). The UI should say so, since az, el, then pol is the field procedure.
- **Minor: Peaks are unrealistically perfect.** Median error is 0.0003°, with no backlash, encoder quantization, wind or scintillation.

## Unanswered questions
1. How do I know I'm on the main lobe and not a side lobe in the field?
2. Why does a "geostationary" satellite move, and how much is too much?
3. When do I use program track, step-track, or just a fixed mount?
4. Where does expected level come from, and what if my reading is 3 dB low?
5. How close to peak is good enough for this dish and band?
6. What RBW and span should I use to find a beacon, and why did it disappear?
7. When do I peak polarization, and how do I check cross-pol?
8. How much signal does step-track cost during its test moves?
9. How do rain, wind and LNB drift change what I'd see?
10. How would this look on a real analyzer at L-band IF after the LNB?

## What works and must stay
1. Pause and step-through with actual readings, positions and fit results.
2. The live search map tied to az/el/level history.
3. The physical aperture pattern: beamwidth and side lobes respond correctly to dish size and frequency.
4. Reveal offset, which lets learners try first and then check truth.
5. Honest data labeling, including "this frequency is made up" for estimated beacons.

## What I could not test
- Raster runs, physical touch-and-hold, arrow keys, screen readers and "Use my location".
- LEO passes, and multi-hour live tracking. Drift figures come from propagating the bundled elements.
- Live CelesTrak/SatNOGS data, which was blocked as instructed. No repo files were changed.
