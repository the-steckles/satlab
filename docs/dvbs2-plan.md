# DVB-S2 signal overlay plan

Status: plan only, for review before any code is written.

## Goal

Show why a DVB-S2 receiver degrades, loses lock, and can capture a stronger overlapping signal, and how operators detect and respond to that. It extends Interference Lab and follows the safety limits in `ROADMAP.md`.

## Model

- Use the fictional SatLab-1 transponder from Interference Lab.
- Generate random symbols directly for each constellation. There is no real baseband framing, scrambling, LDPC or BCH encoder, and no transport stream.
- Show two signals as a ratio (overlay-to-carrier, in dB), plus frequency, symbol-rate and timing offsets.
- Represent the receiver as a state machine: searching, frame sync, carrier lock, FEC lock, degraded, lost, and locked to the other signal.
- Drive state changes from published Es/N0 thresholds and a simple capture model, with its limits labeled.

## Views

- Constellation with live MER, showing two overlapping signals as rings and smeared clusters.
- Receiver state timeline, using the same pause-and-step review as Peaker.
- Spectrum and waterfall from Interference Lab.
- Sweep of overlay ratio against receiver state, showing the degraded region and capture threshold.

## Lessons

1. Constellations, MER and MODCOD thresholds.
2. What PLHEADER sync does, conceptually.
3. An overlapping signal first acts like interference.
4. Why matching symbol rate and frequency changes the receiver's behavior.
5. Capture: the receiver follows the stronger signal.
6. Defender's view: sudden changes in level, MER, service identifiers and carrier parameters.
7. Mitigation and response: monitoring, authentication and encryption of content, carrier identification (CID), and reporting.

## Out of scope by design

- Bitstream or transport stream generation.
- IQ export, SDR output or any transmit path.
- Real satellites, services, power levels or link budgets for an overlay.
- Procedures for finding or acquiring a real carrier.

## Questions for review

- Should this be a third mode in Interference Lab or its own page?
- How much of the capture behavior should be shown, given it needs to stay educational?
