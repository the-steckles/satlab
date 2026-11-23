## Verdict
Interference Lab is well structured and its transponder core is much improved, but I would not ship it as a diagnostic trainer yet. Diagnose can still be scored 10/10 without opening a plot, and the adjacent-satellite and cross-pol cases teach checks the simulator contradicts. These are small, targeted fixes.

## Reproduced findings

**1. Critical: Diagnose still doesn't require the analyzer.**
- Did: scored 3 shuffled runs using only rows visible in the site table.
- Saw: 30/30. Eight causes fall to simple table logic, swept shows as a changing Es/N0, and CW vs modulated falls to a memorized value (−6.0 vs −3.6 dB). Each cause has one fixed instance.
- Why: learners can pass without the CW, modulated or waterfall skills the lab teaches.
- Fix: randomize levels and offsets, add same-table pairs, and ask for the evidence. `model.js:240`

**2. Critical: repeaking doesn't reduce adjacent-satellite interference.**
- Did: Lesson 16, mispointing 2 to 0 dB, as the lesson instructs.
- Saw: in-band level stayed −2.9 dB. C/I improved only 1.0 to 3.0 dB, from the carrier recovering. Site A stayed Lost. Going to 6 dB off peak doesn't raise it either.
- Why: the field guide's test, "It changes when you repeak", fails in the simulator.
- Correct: the unwanted signal should change with antenna discrimination, normally much more than the wanted carrier near peak (high confidence).
- Fix: tie ASI level to pointing for `source: 'asi'`. `model.js:95`, `lessons.js:76`, `index.html:174`

**3. Major: Receiver shows Locked during relock.**
- Did: Lesson 6, sampled the state across a sweep.
- Saw: Locked 82% of the time, but 41 points of that fall inside the relock wait. At 0.5-2 s sweeps it reports 81% above threshold, 0% usable, while still flashing Locked.
- Fix: add a Reacquiring state from the same timer. `model.js:109`, `model.js:201`, `main.js:53`
- Opinion, medium confidence: a full 2.1 s relock after every brief crossing is too pessimistic. Short hits often cause errored frames without full loss of sync.

**4. Major: cross-pol numbers are inconsistent.**
- Lesson 15 has a leak at +3 dB and a source "25 dB stronger", so the source is 28 dB above your carrier. Yet it blames a poorly aligned feed, which means *low* isolation, not 25 dB.
- The +25 is hardcoded. Switching the path to downlink shows +25 at Site B, which isn't affected. `model.js:128`
- "Seen at every site" is also too broad: a receive-feed skew affects one site (high confidence). `index.html:173`
- Fix: derive the reading from a stated isolation and path, and add the receive-side case.

**5. Major: power robbing is taught but never tested, and one figure is wrong.**
- Lesson 11 says the tone takes "94% of the input". Input share is 83%; 94% is the output share after suppression. `lessons.js:55`
- No ticket or field-guide entry covers robbing, so learners never separate it from overdrive or in-band CW.
- Fix: correct the label and add a ticket with a strong signal clear of both carriers.

**6. Major: "Noise floor change" reports in-carrier interference.**
- Lesson 8 shows +9.3 dB and ASI +15.0 dB, while the floor beside the carriers is essentially unchanged.
- Why: the field guide uses noise floor to separate rain from pointing.
- Fix: split into "Floor beside carrier" and "In-carrier N+I". `model.js:105`

**7. Major: the backoff control mixes two physical meanings.**
- Did: moved IBO from 6 to −10 dB.
- Saw: C/N uplink stayed 22.0 dB while the Satellite input noise floor rose 16 dB (−22 to −6). Carrier trim, by contrast, raises C/N uplink.
- Correct: more uplink power raises C/N and leaves input noise alone. A gain change would act after the input point.
- Fix: define the control as transponder gain and measure after it, or model it as uplink drive. `model.js:62-64`

**8. Minor.**
- CW ticket tone is 1.97x RMS symbol amplitude on 16APSK, so the taught ring is unreadable. Lesson 7 uses 0.36x. `model.js:254`
- Lesson 6 says the sweep "only hurts while crossing", but the same tone costs 1.8 dB margin between carriers through robbing.
- Explanations cite noise floor and carrier level, but those rows stay hidden after answering. `main.js:45`
- Lesson 12 never explains why ALC improves margin by 4.4 dB (C/IM 9.0 to 23.0).
- Lesson 13's "the last lesson" means the previous one.
- Sandbox can't create cross-pol or ASI because `source` has no control.
- Phone: no overflow, but controls begin about 2,270 px down and the field guide about 2,820 px.

## Earlier findings
- **Fixed:** 3 saturation calibration, 4 tone height/RBW, 5 independent MODCOD, 6 brick-wall edge, 8 C/IM explanation.
- **Partly fixed:** 1 noise floor (now overstates), 2 Diagnose (10 tickets, still table-solvable, no score), 7 robbing (physics good, share wrong), 9 IQ (taught, lost in tickets).
- **10, ALC: mostly fixed.** The ±15 dB range and fade lesson work (14.5 vs 13.6 dB). The benefit under strong interference is still unexplained.
- **11, minors: partly fixed.** Beacon, throughput, sandbox sweep percentage and the nominal-level label are done. Still open: a 30 Msym/s carrier at +15 MHz runs past the transponder edge with no penalty (10.6 dB Es/N0, same as centered). Phone controls remain far from the lesson.

## Unanswered questions
1. How do I tell power robbing from overdrive on an analyzer?
2. What does a receive-feed cross-pol problem look like at one site?
3. How much should ASI fall after a proper repeak?
4. Can uplink ASI hit every site? The guide implies one site only.
5. Why might a modem show lock while traffic is errored?
6. How short can a hit be before lock is lost?
7. When should I request a carrier move, and who coordinates it?
8. What if the beacon drops because of my LNB or cabling?

## What works well
- Four test points plus Site A/B comparison.
- Live-number lessons that matched the table in every lesson I checked.
- Tone vs noise-like limiter suppression (10.8 vs 6.7 dB robbing at +10 dB).
- ALC with finite range, shown both helping and hurting.
- Defensive framing that ends in reporting to the operator.

## Could not test
- Real modem or transponder behavior; suppression and C/IM are textbook-level models.
- Physical phone touch or a screen reader. Phone results are layout measurements at 390x844.
- My first ticket pass got all 10 right from plots and symptoms, but the capture log also included hidden rows, so it wasn't fully blind. The 30/30 run used visible rows only, and its rule was written after I read the source.
