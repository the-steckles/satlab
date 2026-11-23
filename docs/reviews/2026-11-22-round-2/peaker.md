# Peaker review (/peaker/)

## Verdict
The core lesson works: on GALAXY 17 with program track off, step-track held within 0.003° while the fixed-dish reading fell from -114 to the noise floor (-143 dBm). I would not ship it yet, because the guided task can finish without teaching tracking, and the fixed-dish comparison and status text can mislead. The fixes are small. **LEO, phone and part of 600x review remain unverified** (see "Could not test").

## Findings: reproduced

**1. Major: the guide's "Keep it peaked" step completes itself on inclined satellites.**
- Did: selected GALAXY 17 and pressed Auto-peak at 60x.
- Saw: all four steps were struck off the moment it read "Peaked." Program track is on by default for inclined satellites, and that alone passes the check.
- Why it matters: the learner never sees why tracking is needed, which is the point of this satellite.
- Fix: require the learner to watch a fixed-versus-tracked divergence, for example 1 dB of fixed-dish loss, or to start step-track.
- Where: `peaker/src/main.js:102,535`, `peaker/src/guide.js:15`.

**2. Major: "Fixed dish" can be referenced to a point that was never peaked.**
- Did: started Step-track from a mispoint, and separately from a side lobe.
- Saw: Fixed dish read -138.2 dBm from the mispoint and -134.5 dBm from the side lobe. The plot note still says "a dish left fixed at your last peak." After Go to predicted, live level was -115.3 with Fixed still at -134.5.
- Why it matters: the comparison overstates or invents the benefit of tracking.
- Fix: set the reference only after a confirmed peak. Otherwise show "no peak yet".
- Where: `peaker/src/main.js:298,554`.

**3. Major: Step-track shows green "Tracking." with no valid track.**
- Did: started it 1.3° off, and again on the first side lobe.
- Saw: green "Tracking." at -138 dBm and -134.6 dBm, about 21-24 dB below expected.
- Cause: the warning is skipped while `ctl.level` is null, before the first axis completes. Slow headless frames lengthened this window, so I did not measure its real duration.
- Fix: show "Measuring…" until the first level exists.
- Where: `peaker/src/main.js:512`.

**4. Major: the side-lobe warning outlives the side lobe.**
- Did: Go to a side lobe, then Go to predicted.
- Saw: 0.000° off, "main lobe", while the status still said "Moving to the first side lobe…".
- Why it matters: the display contradicts itself on the exact skill being taught.
- Fix: clear the status on arrival, or on any later pointing command.
- Where: `peaker/src/main.js:757-769`.

**5. Minor: the history window label disagrees with its axis at speed.**
- Saw: Window reads "30 s" while the axis spans -300 min at 600x.
- Fix: label the options as real time, or show the simulated span.
- Where: `peaker/src/main.js:559`.

**6. Minor: at 600x an auto-peak collapses to a spike in Pointing History.**
- Cause: history samples every third sweep, about 60 simulated seconds at 600x, so the search and refine phases barely appear.
- Fix: record per control tick during a run, or point learners to the step review.
- Where: `peaker/src/main.js:438`.

**7. Minor: the guide can credit "Confirm the main lobe" during a search pass.**
- Saw: step 2 stayed complete while the antenna had moved on and Lobe check read "no signal".
- Fix: require the level to hold briefly, and do not score during a controller search.

## Findings: by calculation or code reading (not reproduced)

- **Major, high confidence: fixed-mount advice understates loss.** `guide.js:34` measures excursion from the *average* position, but a dish is peaked at some moment in the day. Peaked at one end of the track, the offset is up to twice as large and the dB loss about 4x. With 0.25° excursion and a 0.69° beam, the text says 1.6 dB and the worst case is about 6.3 dB. "Under 0.5 dB, does not need tracking" can really mean about 2 dB. Fix: use peak-to-peak excursion, or state the assumption.
- **Minor: New mispoint may pre-credit the guide.** `S.trackEma` is not reset (`main.js:236-260`), so a mispoint from a true peak could pass steps 1-2 on the old level. My run did not start from a peak.
- **Minor: New mispoint while paused jumps simulated time** by the paused duration, because `main.js:238` clears `paused` without restoring the offset.
- **Minor: thresholds differ.** The guide uses 6 dB for main lobe, while Lobe check and the controller use 8 dB (`guide.js:13,29`).

## Opinions
- **Major:** comparing against "Expected on-axis" is the only lobe test taught. In the field, EIRP is uncertain and rain shifts the level. Also teach the symmetric lobe pattern and scanning across both sides.
- **Minor:** pointing is still unrealistically perfect, with no backlash, wind or encoder step.

## Earlier findings
- **Fixed, seen running:** 3 (inclined label), 4 (time acceleration and fixed-versus-tracked trace), 6 (waterfall clears, color and time scales), 7 ("not detected", C/N in 3 kHz).
- **Fixed in code, not run:** 1 (noise-only "Peaked"), 2 (RBW peak detection), 5 (valley fit), 8 (hold on lost track).
- **Partly fixed:**
  - Guided task: present, but see findings 1 and 7.
  - Polarization: stated in the guide's final step, still not modeled.
- **Not verified:** 9 (phone order).

## Unanswered questions
1. How do I tell a side lobe from the main lobe without a trusted expected level?
2. How close to peak is good enough for this dish and band?
3. What does step-track cost in signal during its test moves?
4. When is program track better than step-track, and what happens if the elements are stale?
5. How do wind, rain and scintillation disturb step-track?
6. How do I peak polarization and verify cross-pol?
7. How does this look at L-band IF after the LNB?

## Must keep
1. Pause and step-through using real recorded readings and fits.
2. The fixed-versus-tracked divergence at 600x.
3. The daily motion plot with the true-size beam circle.
4. The search map and parabola fit views.
5. Honest labeling of modeled and estimated data.

## Could not test
- **The final verification run was stopped by the system for low memory and, as instructed, not restarted.** It left no browser on port 9431. Its LEO narrow-beam and fixed-mount checks never ran.
- **LEO:** only partial VHF runs on ISS, with a 62° beam and starved frames. No conclusion on LEO tracking.
- **Frame rate:** headless rendering fell from about 190 to 2-3 frames/s mid-run, a known harness issue. A full 1x auto-peak never finished, so its 48 s timing is unconfirmed.
- **600x step-through:** pause froze state and the first step back worked. Later clicks did not update within 200 ms, which is inconclusive, so I am not reporting it as a bug.
- **Speed change mid-run:** one 1x to 600x to 60x auto-peak finished correctly (0.001° off).
- Phone layout, raster scan and live orbital data were not tested. No repo files were changed.
