# Field Troubleshooter review

**Verdict:** Do not ship as is. The structure, the first-failure modem logic and the report's input safety are sound. However, the lab teaches a wrong DVB-S2 receiver model, its search-band display can contradict the modem, and most tickets can be solved by reading the story or toggling the one odd control. These are small fixes, mostly in `troubleshoot/src/model.js`.

## Reproduced findings

**Critical 1: MODCOD is treated as a receiver setting.** `Carrier MODCOD` sits in the Modem panel. On ticket 6, picking a lower MODCOD there marks the ticket solved. Picking 32APSK 3/4 at 9.5 dB drops the modem to "Searching" and hides Es/N0 (`model.js:31-33`). A DVB-S2 receiver reads MODCOD from the PLHEADER, which is sent in robust pi/2 BPSK, so a higher MODCOD should normally stay PL-locked with FEC failing (high confidence). Fix: make MODCOD a read-only decoded value, and solve ticket 6 through a "request from transmit side" action that shows the throughput cost. Add a short "configured vs detected" panel:
- Configured: frequency, symbol rate or blind search, LNB supply, and any non-default scrambling or stream selection.
- Detected: MODCOD, frame size, pilots, and usually spectral sense.

**Critical 2: Search band contradicts the modem.** The drawing uses the configured Rs (`main.js:28`), while the logic uses the true Rs (`model.js:28`).
- Ticket 3, Rs=10: the carrier center is inside the shaded band, but the hint says Frequency fails.
- Ticket 4, 1751.6 MHz, Rs=5: the center is outside the drawn band, but Frequency passes and Symbol rate fails.

Fix: use one capture calculation for both, based on the configured Rs.

**Major 3: Tickets can be solved by guessing.** Each has one fault, and the story often names it. Ticket 1 is the one unchecked box. Ticket 5 states high-side LNB and is solved by the one remaining checkbox. On ticket 6, every lower MODCOD counts equally, including QPSK 1/2. "Solved" means Locked was reached at any time. Fix: remove the diagnosis from stories, add decoys and two-fault tickets, and ask for the diagnosis before accepting lock.

**Major 4: Symbol-rate method is fragile.** Ticket 4 teaches occupied width / 1.2. That assumes a 0.20 roll-off, but DVB-S2 also uses 0.25 and 0.35. At 0.35, 9 MHz implies 6.67 Msym/s. The plot already has the better cue: the -3 dB width equals Rs at any roll-off (`main.js:43`). Fix: teach -3 dB width as the estimate, then confirm against the carrier plan. The 0.1% tolerance also means a real analyzer estimate would rarely lock. Tolerance varies by demod (medium confidence).

**Major 5: Escalation order conflicts with itself.** Step 1 includes pointing, cabling and LNB checks, but step 3 says to capture before changing anything. Step 2 compares other sites, which a technician often needs the NOC to do, yet the NOC is step 4. Step 1 also omits the technician's own transmit chain, and "only you affected" omits local terrestrial interference. Suggested order (`model.js:93-100`): capture, non-invasive local checks including own transmit status, NOC or provider, comparison, operator, then regulators via operator or licensee. Keep "Do not transmit anything to counter it."

**Major 6: Report fields allow an unusable report.**
- All fields set to "x", or frequency "banana", shows "All required fields are filled in."
- `Center frequency (MHz)` does not say downlink RF vs L-band, which can send an operator to the wrong frequency.
- There are no fields for affected carrier, receive location, or capture span/RBW, although the escalation text demands those capture details.
- `Use current time` fills the **Start** field, inviting report time to be recorded as onset.
- There are no examples, placeholders or practice scenario.

Fix: label it "Downlink RF center," add the missing fields, add light format checks, and include a worked fictional example.

**Major 7: Analyzer level and readout disagree.** Tickets 3 and 4 both read -48 dBm and plot the same -66 peak, despite 2.4 vs 9 MHz widths. Equal total power should differ by 5.7 dB in PSD. On ticket 6, the readout falls 6 dB while the plotted peak falls 4.5 dB. RBW is never stated. The plot is driven by Es/N0 and the readout is a separate constant. Fix: derive the trace from level, width and a stated RBW. The analyzer span also rescales when only the modem tuning changes, so label it as an auto-span teaching view or decouple it.

**Minor 8:** The checklist asks about the modem's minimum level, but neither the -75 dBm limit nor a low-level ticket appears (`model.js:5`).

**Minor 9:** With focus held in a number field, Restart leaves the display stale: it showed 1750 while the real config was 1250 (`main.js:65`). I triggered this with a scripted click. It likely affects browsers where buttons do not take focus, but I did not test Safari.

**Minor 10:** On the phone Report view, the Ticket/Analyzer/Modem/Checklist bar stays visible, and tapping Analyzer does nothing. `Clear` wipes the report with no confirmation or undo.

## Technical opinions

- **Major:** Ticket 5's 14250 MHz LO is an unrealistic example because it sits in the common Ku uplink band. Use a C-band high-side LNB, such as a 5150 MHz LO (high confidence).
- **Major:** "A locked demodulator proves the RF... are right" overclaims. It can lock on the wrong satellite, polarization or a similar carrier. Add carrier identity verification.
- **Major:** The check order is reasonable but omits polarization, correct satellite, 10 MHz reference where used, and a **DC block** before connecting an analyzer to a powered line. The DC block is an equipment-safety omission.
- **Minor:** Ticket 3 is an LNB offset rather than drift. Retuning works, but the lesson should cover checking stability and LNB reference type.
- **Minor:** Displayed thresholds match ideal DVB-S2 values. Say that real modems need implementation margin.

## Earlier findings

This lab has no earlier report. README questions 8, 9 and 10 are **partly answered**: the topics exist, but the issues above limit them.

## Unanswered questions

1. What must I enter, and what does the receiver detect?
2. How do I prove this is the right carrier?
3. How do I connect an analyzer safely?
4. What does wrong polarization or the wrong satellite look like?
5. What do low or overloaded input levels look like?
6. What else causes demod lock with no data?
7. Which frequency does the operator want in the report?
8. What does a good completed report look like?

## What works well

- The five-stage ladder with first-failure logic.
- Separating "Demod locked, FEC failing" from "Searching."
- Es/N0 hidden until demod lock.
- Report input safety: HTML stayed inert, pasted newlines could not forge fields, and nothing is stored.
- "Do not transmit anything to counter it," plus the regulator path through the operator or licensee.

## Could not test

Safari/iOS, real clipboard behavior on devices, screen readers, and real modem hardware. Demod tolerance claims come from domain knowledge, not a specific modem datasheet. I solved all tickets from symptoms before using hints, but tickets 1 and 5 were effectively given away by their setup. No repo files were changed.
