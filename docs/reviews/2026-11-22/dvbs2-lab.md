**Verdict**
The layout and the sent / IQ / decoded comparison make capture easy to see, and the C/(N+I) arithmetic and MODCOD thresholds are right. The receiver's failure sequence is wrong around threshold, though, and the monitoring panel says "Normal" during an outage. Several lessons also contradict the live display. Fix those before technicians learn from it.

**Confirmed findings (reproduced)**

**Critical**

1. **"Near the cliff" is already over it.** Lesson 4 at defaults shows Es/N0 6.5 against 6.6 needed, Searching, NO SIGNAL, no phase lock. The text says "about −0.1 dB from the limit... any further rise will break the picture." Why it matters: the key pre-failure moment is never shown. Fix: use about −8.5 dB so margin is positive, and word the margin as "above/below". `lessons.js:18-19`

2. **Monitoring reports "Normal" while service is down.** On the ramp at −7 dB: Signal lost, level +0.8 dB, "Normal." Lesson 4 shows Searching, identity "none", still "Normal." Alarms use only total level ≥1 dB or identity. Why it matters: it teaches that a quiet level meter means a healthy service, when the real lesson is that an interferer can kill a carrier while adding under 1 dB. Fix: alarm on lock state, MER and margin, and call out this case explicitly. `model.js:92-100`, `main.js:99`

3. **Threshold behavior is backwards.** At −7.5 dB (Es/N0 6.9, 0.3 dB *above* the quasi-error-free threshold) the picture is heavily blocked. At 0.1 dB below it, the demodulator immediately drops to "no phase lock" and the constellation is drawn as a phase-smeared ring. Correct behavior: essentially clean above QEF, a very steep LDPC/BCH failure within a few tenths of a dB, and demodulator/carrier sync normally surviving *below* the FEC threshold. Technicians use "demod locked, FEC failing" as a diagnostic, and this lab cannot show it. Fix: separate demod lock from FEC lock thresholds and narrow the error band. `model.js:34-35,65-68`

**Major**

4. **Lesson text is false on other MODCODs.** With 16APSK 3/4, lesson 6 says "the receiver acquires it" while the display stays Searching. Lesson 7 says "still following the carrier" with Searching/None. With QPSK 1/2, lesson 4 says "little left to give" at 5.5 dB margin, and lesson 7's "would not have locked" is false (7.4 dB exceeds the 2.5 dB acquire level). Fix: condition text on state, or have lessons set the MODCOD and C/N. `lessons.js:15-31`

5. **Walkthrough goes stale during the main interaction.** During the ramp the panel still says "A healthy broadcast... picture is clean" over a broken picture. Moving sliders has the same effect. `renderLesson` is not in the loop. Fix: re-render, and show a live event caption for each state during the ramp. `main.js:181-203`

6. **Identity and signature are reported before anything is decoded.** "SATLAB-1" and "verified" persist in Signal lost. "UNEXPECTED" and "FAILED" appear at Frame sync, before FEC lock. Why it matters: these fields can only come from decoded data. Fix: show "unknown/waiting" until FEC lock. `model.js:97-99`

7. **Es/N0 is mislabeled.** Displayed "Es/N0" includes interference, so it is really Es/(N0+I0), or C/(N+I). A technician will conclude the noise floor changed. Fix: relabel, and show C/N and C/I separately. `model.js:22`, history and monitoring labels

8. **Level rise ignores the transponder.** The lab reports +10.4 dB as a clean signature, though the Satellite block is the only place the transponder is discussed. A transponder near saturation or under gain control compresses the total and suppresses the wanted carrier, so level alone can understate the event. Fix: add a conceptual caveat or a compression indicator. `model.js:22,95`, lesson 8

9. **Lesson 8 points to evidence that is not there.** It says the monitoring panel shows three signatures including MER, but MER is in the Decoded panel, and has no history or baseline. Fix: add MER to monitoring with a trend. `lessons.js:35`, `index.html:124-131`

10. **Key terms are undefined.** Es/N0, C/N, MER, MODCOD, BCH, LDPC, HPA and CID get no working definition, and "threshold" is never tied to QEF. Fix: short inline glossary or tooltips.

11. **Phone flow separates cause from effect.** No horizontal overflow, but the page is 2694 px tall. With Decoded in view, Run ramp is about 940 px above the viewport and the lesson about 1290 px above. Fix: sticky compact transport/status bar. Range and checkbox targets are also under 32 px.

**Minor**

- Paused: moving C/N updates the label only; IQ and status stay old. `main.js:165,185`
- Restart keeps the changed MODCOD and C/N. `main.js:175`
- History clips the overlay at −20 dB, showing a false flat segment, and has no acquire-threshold line or state markers. `main.js:54-55`
- No ramp-down, although hysteresis is a headline idea.
- 8PSK at C/N 8 never reacquires after the overlay falls to −25 dB (about 8.0 dB against 8.12 needed). This is valid under the model but unexplained, and the 1.5 dB margin is not labeled illustrative. `model.js:14`
- The alarm says "carrier level" but measures total power. `main.js:99`

**Opinions**

- Capture reads as power-only. Add the concept that most strong co-channel signals simply cause denial of service rather than a decodable replacement.
- Treat service IDs as unauthenticated labels: a mismatch is evidence, a match is not proof.
- "BLOCKED" should be framed explicitly as still an outage.

**Unanswered questions**

1. "How do I tell rain fade, a bad LNB or adjacent interference from a deliberate overlay?"
2. "Why did service die when the level barely moved?"
3. "What should I check first, and who do I call, in what order?"
4. "Demod locked but FEC failing: what does that mean?"
5. "What does MER tell me that Es/N0 doesn't, and what's my normal baseline?"
6. "Can I see a second carrier under the main one on a spectrum analyzer?"
7. "How does carrier ID or geolocation actually help find the source?"
8. "If authentication blocks the picture, are viewers still off air? How do we restore service?"
9. "Who holds the signing keys, and what happens if verification breaks on a legitimate feed?"
10. "Why doesn't the receiver go back to the real carrier as soon as it's stronger?"

**What works well and must be kept**

- Side-by-side sent, IQ and decoded panels with color-coded source.
- The IQ rings around constellation points showing a co-channel signal.
- The crossing carrier/overlay history against the threshold.
- The clear distinction that authentication protects content but does not restore the RF link.
- The safe framing: fictional satellite, no transmit path, no real signal.

**Could not test**

Real phone hardware and touch, screen readers, and comparison with real receivers or measured transponder behavior. Thresholds were checked from my knowledge of EN 302 307-1, without opening the standard. Source was read only; nothing in the repo changed.
