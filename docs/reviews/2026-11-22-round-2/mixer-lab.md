## Verdict
Mixer Lab's RF engine is now strong: product frequencies, image frequencies, image noise, LO starvation and two-tone compression all checked out. I would not ship it as is, because following the lessons' own "click a test point" instruction makes the lesson text false, and the TWTA backoff readout goes negative. The fixes are small.

## Findings (all reproduced in the running lab unless marked opinion)

**Critical**

1. **Lesson text changes meaning at other test points, with no warning.**
   - Did: followed "Click the first and last test points" on Bench step 11, then clicked blocks in other scenes.
   - Saw:
     - Step 11 at RF in: "at the output it is on the right, at 1999.5 MHz". The real output is 300.5 MHz.
     - Bench step 1 at RF in: "this mixer has -0.0 dB of conversion loss".
     - Uplink at IF amp: "leaves the HPA... at −10.0 dBm... +20.0 dB of total gain".
     - LNB at image filter, detuned: "turns... into −119 dBm at 1750 MHz", while that point is still at 12500 MHz.
   - Why it matters: the inversion lesson breaks at the moment the learner does what it asks.
   - Fix: compute lesson text from the final node, or from named nodes. `main.js:219,192`, `lessons.js:12,53,59,114`

**Major**

2. **False "You changed this setup" on untouched Bench step 11.** Restore does not clear it. It is the only false banner across all 27 steps.
   - Cause: the step sets LO 2300 but leaves `product` as `rfMinusLo`, and `syncProducts` then changes it to `loMinusRf`.
   - Fix: add `product: 'loMinusRf'` at `lessons.js:51`.

3. **TWTA exceeds its "hard ceiling" on the OBO readout.**
   - Did: drove the input to −10 dBm.
   - Saw: IBO −13.9 dB, OBO −0.6 dB. The fundamental stays at 51.97 dBm, under the 52 dBm Psat.
   - Cause: OBO totals every product, including 3rd-harmonic and higher products near 37.5 GHz.
   - Fix: total only the products in the carrier's zone. Show overdrive as "past saturation". `model.js:227-230`

4. **Filter editor hides the noise passband when detuned.**
   - Did: moved the LNB image filter to 9000 MHz.
   - Saw: floor flat at about −124 dBm, with no noise hump in the passband. Expected about −69 dBm (LNA noise through the filter).
   - Cause: the floor is calculated at the wanted frequency, where the filter rejects it, then used as the passband level.
   - Fix: shape the noise arriving at the filter, then add the thermal floor. `main.js:139-145`, `model.js:214-233`

5. **Image explanation is wrong when 2·LO < RF < 3·LO.**
   - Did: RF 5000, LO 2000.
   - Saw: "Both F1 and the image are above this low LO", while the diagram shows the image at 1000, below the LO.
   - Fix: branch the text on `image > lo`. `main.js:59-64`

6. **Two-tone compression is measured but never taught.** The 6.1 and 1.4 dBm readouts are right: 4.7 dB apart, against 4.77 dB for a cubic device. No lesson explains why, or that 1.4 dBm is per tone (4.4 dBm total). The plot marks only the one-tone P1dB.
   - Fix: add one lesson step and a two-tone marker. `lessons.js:47`, `plots.js:209`

7. **Opinion: the TWTA curve does not show backoff.** The axis is chain input per tone, with no Psat line and no IBO or OBO marking, so learners must link two text readouts to the curve. At the TWTA test point, add a Psat line and an operating point labeled with IBO and OBO. `plots.js:130-222`

**Minor**

8. The satellite image lesson reports 4.22 dB, but it removes all filters. Removing only the image filter gives 4.52 dB, so the lesson understates the penalty from 1.53 dB. "Input filter restored" also names the wrong filter. `lessons.js:80-85`
9. Degenerate plans read as nonsense: RF = 2·LO gives "image... at 0 MHz", and RF = LO gives "both convert to 0 MHz". `main.js:65`
10. "30 dB/octave" is misleading on a bandpass, because the slope applies to offset from center, not to octaves of RF. `main.js:119`
11. Opinion: LO +17 dBm on a level-7 mixer simply improves loss, with no over-drive warning.
12. Changing scene silently discards edits. I confirmed LO drive returned to 7 dBm.

## Earlier findings
- **Fixed:** 1 image noise, 3 actual gain, 4 fixed band filters, 5 hold output, 6 two-tone curve, 9 LO linearity, 10 frequency continuity, 12 visible inversion. Finding 7 (image power sum) is fixed in code, but I did not inspect its drawing.
- **Partly fixed:** 2 (new case in finding 5), 8 (saturation and IBO/OBO added; no Psat marker or AM/PM), 11 (stopband and skirts added; detuned noise wrong).
- **13, stale text: partly fixed.** The banner catches control changes, but not test-point changes, and it fires falsely on Bench step 11.
- **14, phone flow: partly fixed.** There is no horizontal overflow, scene tabs wrap, and a jump bar exists. Cause and effect remain far apart: lesson at 224 px, spectrum 875, controls 1992, output plot 3354.
- **Earlier minors:** 3·LO wording, RF = LO loss and term definitions are fixed. Reset scene still returns to step 1. I did not recheck the HPA wording.

## Unanswered questions
1. Why does two-tone P1dB fall about 4.8 dB per tone?
2. Where am I on the TWTA curve, and what does overdrive past saturation do?
3. How do I prove a signal is an image? Retune the LO and watch which way it moves.
4. Why does bench noise figure ignore the image while an LNA chain gains 3 dB? (SSB vs DSB NF.)
5. What happens to spectral sense across uplink, transponder and LNB combined?
6. Which real plans invert? A C-band LNB with a 5150 MHz LO is the classic example.
7. What C/N or MER does this IM level cost?
8. How do LO phase noise and frequency error appear?

## Must keep
- Clickable test points with named products.
- Filter plot with live products on the curve.
- Frequency-plan diagram with equal distances.
- Image-noise model: about +3 dB without a filter, including a low-IF image inside the passband.
- Separate small-signal and actual gain, with LO starvation affecting loss, NF, IP3 and P1dB.

## Could not test
