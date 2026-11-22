# SatLab roadmap

SatLab is one repo and one static site, with each simulator on its own page. Code moves into `lib/` only once a second simulator needs it.

Audience: working RF and satcom technicians. Assume dB, dBm and spectrum analyzers. Explain concepts plainly, and keep equations available without requiring them.

## Build order

Each tool sets up the next.

| # | Tool | Status | Why here |
|---|------|--------|----------|
| 1 | Peaker | Live | Pointing, peaking, side lobes, auto-peak, step-track |
| 2 | Mixers and intermodulation | Built on `overnight/simulators` | Creates the shared signal engine |
| 3 | Link interference | Built on `overnight/simulators` | Reuses the amplifier model to explain saturation and power robbing |
| 4 | DVB-S2 signal overlay | Built on `overnight/simulators`, see `dvbs2-plan.md` | Needs receiver-state modeling on top of the link model |

## 2. Mixers and intermodulation

**Scenes**

1. **Bench:** one mixer with RF and LO inputs on a virtual test bench.
2. **Ground uplink:** IF, upconverter or BUC, filter, HPA, feed.
3. **Satellite receive (uplink):** the satellite's LNA, downconverter, filter and channel path.
4. **Satellite downlink:** channel amplifier, TWTA, output filter, antenna.
5. **Ground downlink:** feed, LNB (LNA, image filter, mixer, LO), IF to the modem.

**Concepts to teach**

- Sum and difference products, and high-side against low-side LO.
- Image frequencies and why the image filter sits before the mixer.
- Harmonics and the mixer spur table (`m RF ± n LO`).
- Single-ended, balanced and double-balanced mixers, and which products each one suppresses.
- LO drive, conversion loss, and LO-to-RF, LO-to-IF and RF-to-IF isolation.
- P1dB and compression.
- Two-tone third-order products at `2f1 - f2` and `2f2 - f1`, rising 3 dB per 1 dB of input.
- IP2 and IP3 as extrapolated intercepts, measured live on a slope plot.
- Cascaded gain, noise figure and IP3, and how stage order changes them.
- Spectral inversion from high-side LO.

**Teaching features carried over from Peaker**

- A spectrum analyzer with real axes and hover readouts.
- A "How it works" panel with plain-language explanations using the live numbers.
- Pause and step through guided experiments.

## 3. Link interference

- Link budget with C/N, C/I and C/(N+I), and the resulting Es/N0 margin.
- Interference types: CW, swept, barrage and partial-band.
- Uplink against downlink interference: an uplink interferer is received by the whole footprint, a downlink interferer only affects nearby receivers.
- Transponder saturation and power robbing, using the amplifier model from the mixer tool.
- Adjacent-satellite and cross-polarization interference as innocent causes.
- The operator's view: what the carrier monitor shows, how to tell interference from rain fade or mispointing, how interference is located, and which mitigations work.

## 4. DVB-S2 signal overlay

- Constellations, MER and MODCOD thresholds.
- Frame sync (PLHEADER), FEC and the receiver's lock states.
- A receiver degrades, loses lock, and captures a stronger signal as the power ratio changes.
- The defender's view: what monitoring shows, how an overlay is detected, and what mitigates it.

## Safety limits for tools 3 and 4

These tools teach how links fail and how operators defend them. They are simulators, not transmit tools.

- Use fictional satellites and transponders, never Peaker's real catalog.
- Model DVB-S2 at the symbol and receiver-state level, with no real bitstream encoder.
- No IQ export, SDR output, or anything else that could drive a transmitter.
- No target selection or procedures for attacking a real service.
- Teach detection, location and mitigation alongside every effect.
- State that unauthorized transmission is illegal.

## Other ideas

- A landing-page learning path that links related lessons across tools.
- Rain fade, polarization skew and adjacent-satellite interference in Peaker.
- A phone-friendly layout for every new simulator from the start, reusing Peaker's pinned dock approach.
