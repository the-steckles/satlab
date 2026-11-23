## DVB-S2 Overlay Lab review

**Verdict:** The lab is strong at its default setting (8PSK 2/3, C/N 16), and the earlier threshold and alarm failures are largely gone. I would not ship it as is. Demod behavior is tied to the wrong threshold, the hysteresis lesson is false on half the MODCODs, and the display shows things a real receiver cannot know before FEC lock.

### Findings

**Reproduced**

1. **Critical: demod lock is derived from the MODCOD's FEC threshold.** `model.js:16,49,56`
   - Saw: the demod drops at FEC threshold −3 dB, so 32APSK 3/4 loses it at 9.7 dB and QPSK 1/2 at −2.0 dB. Acquisition is gated at FEC threshold +1.5 dB. With 8PSK 2/3 and the overlay at +3 to +8 dB (Es 2.8 to 7.5), a searching receiver stays in "Searching" with rings.
   - Why it matters: DVB-S2 frame sync relies on the PLHEADER, which is designed to work independently of payload MODCOD and well below most FEC thresholds. A real receiver can often sync and report demod lock with FEC failing on the way **in** too. The lab only shows that state on the way down, which weakens its best diagnostic. Confidence: high on the principle, medium on behavior of specific receivers.
   - Fix: use one MODCOD-independent illustrative demod threshold, and allow acquisition to stop at carrier lock with FEC failing.

2. **Critical: lesson 9 (hysteresis) is false on 3 of 6 MODCODs at C/N 16.** `lessons.js:60`
   - QPSK 1/2: Es 7.1, hold 1.0, and the text says a receiver arriving here "could need a stronger signal". Acquire is only 2.5. QPSK 3/4 has the same fault.
   - 8PSK 3/4: says "still following it" and "Holding a lock takes 7.9 dB" at Es 7.1, while the receiver shows FEC failing.
   - Fix: branch on `need <= Es < need + ACQUIRE_DB`, or have the lesson set its own MODCOD and C/N.

3. **Major: MER uses the true transmitted symbols.** `constellation.js:27`, `model.js:100`
   - I compared it with nearest-point (decision-directed) MER on the same samples. At true 6.0 dB, 8PSK reads **7.2 dB, above the 6.6 dB threshold, while FEC is failing**. 32APSK at 3.7 dB reads 10.2 dB.
   - Why it matters: technicians will trust low MER readings that real instruments can overstate. Pilot-aided instruments differ. Confidence: high.
   - Fix: compute it decision-directed, or caveat it and teach the saturation.

4. **Major: monitoring says "Normal" with MER down 7 dB.** `main.js:108-111`, `model.js:112-118`
   - At −10 dB: MER 9.0 against normal 16.0, "Normal." Lesson 10 says operators alarm on MER, but the panel has no MER alarm.
   - Fix: add a warning for MER drop from baseline.

5. **Major: the "Monitoring position" mixes simulator truth with measurements.** `main.js:93,96,101-102`
   - "Following: Overlay" and a pink "following overlay" IQ label appear while Service identity says "waiting for FEC". Per-signal Es and "Real carrier" are also shown, though a co-channel monitor generally sees a composite.
   - Fix: split the panel into "Simulator truth" and "What the receiver/monitor can know". Before FEC, show "unknown signal".

6. **Major: lesson text is still false at user settings.**
   - L1 at 32APSK, C/N 10: "needs 12.7... picture is clean" while FEC is failing. `lessons.js:25`
   - L3 after moving the slider to +5: "15 dB weaker... FEC still corrects everything" while Searching. `lessons.js:34`
   - L7 at QPSK 1/2: says rings and searching, state is FEC failing. `lessons.js:51`
   - L11 at 8PSK 3/4, 16APSK and 32APSK: "still locks to the stronger RF signal", state is Searching. `lessons.js:68`
   - Fix: use state-conditional text, and switch to a live caption once a slider leaves the lesson's value.

7. **Major: lesson 5 opened directly contradicts itself.** `video.js:61`
   - `?lesson=5` shows **NO SIGNAL** under "Demod locked", because no earlier frame exists. The text says "the picture breaks up" and "RF is present".
   - The text also says the constellation "keeps its shape", but the plot is a nearly shapeless disc.
   - Fix: show "NO DECODED STREAM" and reword to "the demod still tracks, even though the points overlap".

**Opinions and technical judgment**

8. **Major: authentication is overclaimed.** `lessons.js:68` says "Encryption and signed streams protect what viewers see." Protection exists only if the receiver **rejects unsigned or invalid content**. Encryption alone does not prove origin, and keys and freshness matter. The model also marks every overlay "UNEXPECTED", which implies identity labels are trustworthy; they are evidence, not proof. Add a "what this does not protect" list: availability, RF link, fail-open receivers, compromised keys.

9. **Major: capture reads as power-only.** "Physics decides that" overstates it. Add that most strong co-channel signals simply deny service, and that a receiver only follows a signal compatible with its configuration. Keep this conceptual.

10. **Minor: IQ interference is symbol-synchronous** (`model.js:92-94`). An unsynchronized interferer usually looks more noise-like, so warn technicians not to expect neat rings.

11. **Minor: CID wording.** "Helps identify who is transmitting" applies to cooperating carriers. A hostile carrier will not usefully identify itself.

12. **Minor: history plot.** Values above 20 dB clamp to a false flat line at C/N 24 (`main.js:57`), and threshold lines redraw across old data after a MODCOD change (`main.js:69-73`).

13. **Minor: lesson 6** credits the small level rise only to power addition. Compression also matters: input +0.9 dB, output +0.5 dB.

### Earlier findings

**Fixed:** 1 (cliff), 7 (label), 8 (compression), 9 (MER in monitoring), 10 (terms), 11 (phone bar), and the minors for pause, reset, ramp-down, and the acquire line.

**Partly fixed:**
- **2, alarms:** outage alarms work, MER alarm is missing.
- **3, threshold:** demod/FEC split exists, but see finding 1.
- **4, MODCOD text:** many branches added, but see findings 2 and 6.
- **5, stale text:** ramp captions work, slider moves still go stale.
- **6, pre-FEC identity:** ID and signature fixed, source label still leaks.
- **History clipping:** bottom fixed, top not.

**Not fixed:** the earlier opinion that service IDs are unauthenticated labels.

### Unanswered questions

1. Why can a receiver show demod lock on a signal it cannot decode?
2. How far can I trust MER when FEC is failing?
3. How do I distinguish rain fade, LNB fault, adjacent-carrier interference and an overlay?
4. What can a spectrum analyzer show when a signal sits under the carrier?
5. What should I check first, and who do I call?
6. What happens when authentication fails on a legitimate feed?
7. What does CID tell me if the interferer has none?
8. How long should recovery take after the interference stops?

### What works well

- Sent, IQ and decoded panels side by side.
- The quiet-outage alarm: service down with only +0.5 dB level change.
- TWTA compression: total saturates at +1.9 dB while the carrier falls 8.5 dB.
- Identity and signature waiting for FEC.
- Defensive framing with no transmit path.

### Could not test

Real receivers, instruments, phones or screen readers. EN 302 307 was not opened; threshold values are from memory. The ramp measured about 0.55 dB/s against 1.5 coded, with uneven headless frame timing, so I am **not** reporting it as an app bug. Recheck it in a normal browser.

Skipped: a line-by-line review of all block descriptions. Risk: finding 1 changes the state machine, so lessons 5, 7, 8 and 9 and `dvbs2/test/model.test.js` must be rechecked together.
