# Link Interference simulator plan

Teaches how interference affects a satellite link and how operators recognize and respond to it. It follows the safety limits in `ROADMAP.md`.

## Model

- A fictional bent-pipe satellite, SatLab-1, with one 36 MHz Ku-band transponder, two carriers and two receive sites.
- All interference levels are relative to the carrier (I/C). The tool has no transmit power, EIRP, antenna or location inputs.
- The transponder uses the same soft-limiter curve as Mixer Lab, so every signal in it shares a fixed output power.
- Site performance is C/(N+I) from uplink noise, downlink noise, third-order products and in-band interference, compared with published DVB-S2 Es/N0 thresholds.
- Interference is treated as noise-like at the demodulator, which is a reasonable first model for LDPC-coded links.

## Effects

- CW, swept, partial-band and wideband interference.
- Uplink interference reaches every site. Downlink interference affects only the nearby site.
- Power robbing in the transponder.
- Rain fade and antenna mispointing as innocent lookalikes.

## Operator view

- Compare each site's carrier level, noise floor and margin.
- A "Diagnose it" exercise presents symptoms and asks for the likely cause.
- Mitigations: move the carrier, use a more robust MODCOD, adjust power, change transponder, and report to the operator for geolocation.
