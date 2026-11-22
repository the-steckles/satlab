# SatLab independent review, 2026-11-22

Five independent reviewers used the labs in a headless browser, then read the code. Their full reports are in this folder:

- [Peaker](peaker.md)
- [Mixer Lab](mixer-lab.md)
- [Interference Lab](interference-lab.md)
- [DVB-S2 Overlay Lab](dvbs2-lab.md)
- [Whole suite](suite.md)

Limits of the review: no real hardware, real phones or screen readers. Physics was judged from RF theory and standards knowledge, not measured equipment.

## Plan

1. **Pass 1, accuracy:** fix what is wrong or misleading, with a test for each model change.
2. **Pass 2, structure:** learning path, cross-links, glossary, phone layout, consistent terms, and the smaller accuracy items below.
3. **Pass 3, new content:** answer the questions the labs raise but do not answer.

Status values: `todo`, `done`. Pass 1 was completed on 2026-11-22, with model changes covered by automated tests. It has not been re-reviewed or checked on real hardware or phones.

### Pass 1

| Lab | Finding | Planned fix | Status |
|---|---|---|---|
| Peaker | Auto-peak reports "Peaked" on noise | Threshold set for the best of N samples, a confirming dwell, and no "Peaked" when a fit is clipped or the level is far below expected | done |
| Peaker | Narrow RBW hides an on-peak beacon | Peak detection per display bin, plus a warning when a real sweep would be too slow | done |
| Peaker | Inclined satellite labeled geostationary | Show "Inclined GEO" with inclination, and default program track on | done |
| Peaker | Fit explanation calls a valley a peak | Detect upward curvature and say there is no peak | done |
| Peaker | C/N is really (C+N)/N | Remove the noise term, label the 3 kHz bandwidth, show "not detected" | done |
| Peaker | Waterfall mixes old and new analyzer settings | Clear it on retune | done |
| Mixer | Removing the image filter improves noise figure | Add image-band noise after the mixer, and add a post-LNA image filter on the satellite | done |
| Mixer | Image explanation wrong for upconverters and RF > 2·LO | Separate explanations and a correct diagram | done |
| Mixer | Gain ignores compression and detuned filters | Show small-signal and actual gain, and use filter loss at the carrier | done |
| Mixer | Band filters follow the signal | Fixed centers for band, image, IMUX and OMUX filters | done |
| Mixer | "Keep output frequency" ignores input changes | Retune the LO when the input moves | done |
| Interference | TWTA backoff miscalibrated | True saturation point, TWTA-like curve, typical C/IM | done |
| Interference | Noise floor row ignores visible interference | Include noise-like interference in the measured floor | done |
| Interference | A weaker tone plots above the carrier, unexplained | Label density and RBW, and teach it in the lesson | done |
| Interference | Brick-wall impact at the carrier edge | Weight interference by the matched-filter response | done |
| Interference | All types rob power identically | Tone and noise-like limiter suppression | done |
| Interference | Diagnose solvable from the table alone | Hide level rows, add tone, swept and no-fault tickets | done |
| DVB-S2 | "Near the cliff" is already past it | Set a level with positive margin | done |
| DVB-S2 | Monitoring says "Normal" during an outage | Alarm on lock and margin | done |
| DVB-S2 | Failure sequence wrong around threshold | Separate demod and FEC lock, with a steep FEC cliff | done |
| DVB-S2 | Lesson text stale or false on other MODCODs | Text follows the receiver state, with a live ramp caption | done |
| DVB-S2 | Identity and signature shown before decoding | Show "waiting" until FEC lock | done |
| DVB-S2 | "Es/N0" includes interference | Relabel as Es/(N+I) | done |

### Pass 2 backlog

- **Suite:** numbered learning path, "next lab" links, `?lesson=` deep links, shared MODCOD table and state names, consistent reset wording.
- **Cross-lab physics:** DVB-S2 level rise should reflect transponder compression. Relock time should match between Interference and DVB-S2. Relabel swept "usable" time as "above threshold".
- **Mixer:** carry 12500 MHz through all scenes, two-tone compression curve, uncorrelated image addition, visible TWTA saturation with IBO/OBO readouts, LO drive affecting linearity, realistic stopband and noise shaping, visible spectral inversion, stale lesson text, phone flow.
- **Interference:** independent MODCOD for the other carrier, beacon readout, C/N breakdown, ALC benefit case and finite range, IQ and signal-type lesson, MODCOD throughput, phone flow.
- **DVB-S2:** MER in monitoring with a trend, ramp-down, history clipping, updates while paused, Restart restoring defaults, phone transport bar.
- **Peaker:** guided first task, time acceleration and fixed-vs-tracking comparison, waterfall color and time scales, step-track holding still after track loss, polarization in the workflow, phone flow.
- **All labs:** glossary or tap-to-define terms.

### Pass 3: questions to answer

1. What is the difference between C/N, Es/N0, Eb/N0 and MER, and which should I trust?
2. Where does my Es/N0 come from, end to end (EIRP, path loss, G/T)?
3. How do I know I am on the main lobe, and how close to peak is good enough?
4. Why does a geostationary satellite move, and when do I need step-track?
5. What backoff should I run, and how do I know I am overdriven?
6. How do I tell CW, modulated, cross-pol, adjacent-satellite and local faults apart?
7. Why did service die when the level barely moved?
8. What does "demod locked, FEC failing" mean?
9. My carrier will not lock: is it inversion, frequency offset, symbol rate or level?
10. Who do I call first, and what goes in an interference report?

Each lab report also lists its own ranked questions.
