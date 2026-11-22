# Mixer simulator plan

## Signal engine (`lib/tones.js`)

Satellite chains span DC to beyond 90 GHz while carriers can be kHz apart, so direct sampling would either alias or need huge FFTs. The engine uses artificial frequency mapping, the method harmonic-balance simulators use:

- Each independent source (RF1, RF2, LO1, LO2) gets a small integer on a virtual grid, chosen so every product `m1 f1 + m2 f2 + ...` up to the tracked order lands on its own bin.
- Nonlinear stages run sample by sample on that grid. An FFT then gives the exact amplitude and phase of each product.
- Each bin decodes back to its real frequency and its label, such as `2·RF1 − RF2`.

This gives exact products with no leakage or aliasing, labels every spur, and is fast enough to rerun on each control change.

## Stage models

- **Amplifier:** gain, OIP3, OIP2 and noise figure. A memoryless soft limiter gives compression, and P1dB is measured rather than assumed.
- **Mixer:** LO-driven switching with single-ended, balanced and double-balanced types, conversion loss, isolation terms and RF-port nonlinearity.
- **Filter:** Butterworth band-pass magnitude response.
- **Noise:** Friis cascade, displayed as the analyzer's noise floor.

## Page

- Scene tabs: Bench, Ground uplink, Satellite receive, Satellite downlink, Ground downlink.
- A block diagram where choosing a stage shows the spectrum at that point.
- A spectrum analyzer with labeled products and hover readouts.
- A two-tone slope plot that measures IP3 and P1dB live.
- A product table listing frequency, level, order and label.
- Guided experiments with Back and Next, each explaining what to look for using live numbers.

## Verification

- Tests compare the engine with closed-form results: conversion products, IM3 level, the 3:1 slope, the intercept, P1dB, Friis cascades, image rejection and balanced-mixer suppression.
- Browser checks cover every scene at desktop and phone widths with no console errors.

Scene values are typical, illustrative numbers rather than a specific product's datasheet.
