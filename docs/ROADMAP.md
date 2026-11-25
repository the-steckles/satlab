# SatLab roadmap

SatLab is one repo and one static site at [satlab.steckley.xyz](https://satlab.steckley.xyz), with each simulator on its own page. Code moves into `lib/` only once a second simulator needs it.

Audience: working RF and satcom technicians. Assume dB, dBm and spectrum analyzers. Explain concepts plainly, and keep equations available without requiring them.

Bugs and inaccuracies are tracked as [GitHub issues](https://github.com/the-steckles/satlab/issues). Every lab links there from its header.

## Labs

Each lab sets up the next.

| # | Lab | Status | What it adds |
|---|-----|--------|--------------|
| 1 | Peaker | Live | Pointing, peaking, side lobes, auto-peak, step-track, daily satellite motion |
| 2 | Mixer Lab | Live | Mixing products, images, spurs, compression and intermodulation through a full link |
| 3 | Link Budget Lab | Live | Where Es/N0 comes from before anything disturbs it, and choosing backoff and MODCOD |
| 4 | Interference Lab | Live | Interference types, power robbing, ALC, rain, mispointing, cross-pol, adjacent satellites and the operator's response |
| 5 | DVB-S2 Overlay Lab | Live | Receiver lock states, capture by a stronger signal, monitoring and content authentication |
| 6 | Field Troubleshooter | Live, still in work | Applies every earlier lab to a modem that will not lock and to an interference report |

Field Troubleshooter is marked "Still in work" on the site because it has known bugs. The flag is `inWork` in `lib/suite.js`, with a matching badge in the root `index.html`.

Design notes for the larger labs are in `mixers-plan.md`, `interference-plan.md` and `dvbs2-plan.md`. Independent reviews and their fixes are in `reviews/`.

## Known open items

From the [second review round](reviews/2026-11-22-round-2/README.md), still open:

- Interference: the Other carrier row does not show Reacquiring, and each Diagnose cause has one evidence answer.
- Mixer: the TWTA plot has no Psat line or IBO and OBO markers.
- Troubleshooter: throughput ignores framing overhead, and the analyzer scale changes between tickets.
- Link Budget still imports Peaker's antenna and path-loss code. Move it into `lib/` if a third lab needs it.
- SatLab-1 and the TWTA are not unified across labs. Their differences are stated on screen.
- Not tested on real hardware, real phones or screen readers.

`lib/receiver.js` holds the one receiver lock rule that Interference, DVB-S2 and Troubleshooter share.

## Safety limits for the Interference and DVB-S2 labs

These labs teach how links fail and how operators defend them. They are simulators, not transmit tools.

- Use fictional satellites and transponders, never Peaker's real catalog.
- Model DVB-S2 at the symbol and receiver-state level, with no real bitstream encoder.
- No IQ export, SDR output, or anything else that could drive a transmitter.
- No target selection or procedures for attacking a real service.
- Teach detection, location and mitigation alongside every effect.
- State that unauthorized transmission is illegal.

## Ideas

- Rain fade, polarization skew and adjacent-satellite interference in Peaker.
- LO phase noise on the constellation, adaptive coding during a fade, and uplink power control.
- A Psat line and IBO and OBO markers on Mixer Lab's TWTA plot.
- A phone-friendly layout for every new simulator from the start, reusing Peaker's pinned dock approach.
