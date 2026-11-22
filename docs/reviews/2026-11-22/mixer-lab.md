## Verdict
Mixer Lab has a strong structure and a real tone-level engine: product frequencies, the 3:1 IM3 slope, inversion flags and image frequencies all checked out. It should not be used to teach yet. Its readouts and text are wrong on image noise, upconverter filtering, gain under compression, and fixed band filters, which are things technicians act on.

## Confirmed findings (reproduced)

**Critical**

1. **Removing the image filter improves noise figure.** Sat receive, Filters off: NF goes 1.52 → 1.21 dB while the lesson says noise "folds straight into your transponder". LNB stays at 0.80. Correct: with a broadband LNA ahead of the mixer, losing image rejection costs up to about 3 dB. Fix: add image-band noise to the cascade and floor. `model.js:121-126,172`, `lessons.js:77`

2. **Image explanation is wrong in two scenes.**
   - Ground uplink says the image "must be filtered out before the mixer", but the Tx filter sits after it. The real upconverter problem is the other sideband (11850 MHz), removed after the mixer.
   - Sat receive says 10750 is "the same distance on the other side" of a 1750 LO. Both are above the LO; 10750 converts through Image + LO.
   - Fix: separate text for upconversion and for RF > 2·LO. `main.js:52-55`

3. **"Gain from input" ignores compression and detuning.** TWTA at −20 dBm in: 47.6 dBm out, real gain 67.6 dB, display 89.5. Bench filter detuned to 1000 MHz: carrier −95.7 dBm, yet gain −7.4 dB, NF 7.4 dB, floor unchanged. Fix: show small-signal and actual gain separately, and use filter loss at the carrier. `main.js:158`, `model.js:115-119`

**Major**

4. **Band filters follow the signal by default.** Rx carrier at 16000 MHz passes the "14 GHz" filter at the same −90.3 dBm. An LNB at 9000 MHz is also unaffected. Fix: fixed centers for band, image, IMUX and OMUX filters. `model.js:86`

5. **"Keep output frequency" does not hold when RF changes.** Uplink IF 1200 → 1300: LO stays 13050, output moves to 14350. It only acts on product change. Fix: retune the LO on RF change. `main.js:249-256,265-268`

6. **Output plot and P1dB are single-tone on a "per tone" axis.** Bench P1dB reads +6.2 dBm, but two tones compress 1 dB at +1.75 dBm per tone. At TWTA −42 dBm the curve reads 46.4, actual tone 44.5. The two-tone curve is computed but never drawn. `plots.js:182`, `model.js:207-209`

7. **Image and carrier always add in phase.** Equal levels draw one line at −11.4 dBm, while the table and readout say −17.5. The pink line also hides the wanted carrier. Fix: power-sum for uncorrelated signals, or expose relative phase, and show both contributors. `tones.js:169-178`

8. **The TWTA lesson does not reach saturation.** "Into saturation" (−42 dBm) is about 5.7 dB below the 52.1 dBm single-tone ceiling. No IBO/OBO readout or Psat marker exists, and "Operating with backoff" changes nothing from the prior step. P1dB is 7.6 dB below Psat, soft for a TWTA, and AM/PM is absent. `lessons.js:94-99`, `tones.js:78-79`

9. **LO drive does not affect linearity.** LO from −10 to +17 dBm: IIP3 stays 15.0 and P1dB 6.1. Real diode mixers lose both when starved. This undermines "Starve the LO". `tones.js:131`

10. **The five scenes do not form one link.** Sat receive outputs 12500 MHz at −68.7 dBm; sat downlink starts at 12500 and −52 dBm; ground downlink receives 12000. Fix: a 2250 MHz LO gives 12000, and explain or remove the level gap. `model.js:32,44,55`

11. **Noise and rejection are unrealistic.** The floor stays flat through filters, so no filter skirt appears. Rejection is unbounded (297 dB), the table lists −330 dBm products, and the filter plot clips at −80 as if that were its floor. Fix: stopband limit, shaped noise, "below noise" marking. `tones.js:99-102`, `plots.js:55,218`, `main.js:139`

12. **Inversion is only a label.** Two equal tones look identical when flipped. Fix: unequal tones or an asymmetric carrier. `lessons.js:48`

13. **Lesson text goes stale.** With Double-balanced selected, step 5 still says "A single-ended mixer…". LO at +17 reads "falls to −16.5 dBm". Input at −30 still says "raised 10 dB". Fix: condition the text or show "you changed this setup". `lessons.js:25,33,41`

14. **Phone flow separates cause and effect.** The lesson is at y≈193, spectrum 854, Wanted product 2254, output plot 3196. Scene tabs overflow (575 px in 390) with no cue.

**Minor**

- "Overdrive the HPA": the BUC mixer compresses about 1.7 dB, the same as the HPA. `lessons.js:63`
- "Odd products like 3·LO remain": 3·LO is −92.6 dBc; 3·LO − F1 is the strong one. `lessons.js:29`
- LO, IF, RBW, dBc, IBO/OBO are never defined; P1dB and IP3 appear long before their lessons.
- RF = LO reports "−10.0 dB of conversion loss".
- Reset scene jumps to step 1.

## Opinions
- Bench image lesson needs a preselector block, because learners are told the fix but cannot apply it.
- Add a one-line "Try this" action and expected result to each step.
- Inverting Ku transponders are uncommon; say so.

## Unanswered questions
1. "How much does my noise get worse without the image filter?"
2. "How far am I backed off, in IBO and OBO?"
3. "Why is two-tone compression different from single-carrier?"
4. "What LO level does this mixer actually need, and what happens to IP3 if it drops?"
5. "How do I tell an image from a real interferer on an analyzer?" (for example, retune the LO and see which way it moves)
6. "Which spur will land in my band, and how do I plan around it?"
7. "How does this carrier get from the uplink to my modem, end to end?"
8. "What C/N or MER does this IM level cost me?"
9. "How much rejection can a real filter give?"
10. "How do LO phase noise and frequency error show up?"

## Must keep
- Clickable test points through the chain.
- Exact named products with hover and table.
- Filter plot with live products placed on the curve.
- Frequency-plan number line showing equal LO distances.
- Guided steps that use live values.

## Could not test
- Real touch gestures, screen readers, or browsers other than headless Chromium.
- Model sweeps ran from source, not the served bundle; UI readings matched where compared.
- Hardware accuracy is judged from RF practice, not datasheets or measurement.
