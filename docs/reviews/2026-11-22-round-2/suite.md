# SatLab whole-suite review

**Verdict:** The suite now works as a curriculum. All 6 labs load without console errors, every lesson deep link lands correctly, and the 175 tests pass. I would not ship it as is, because the labs still disagree on receiver lock, the SatLab-1 baseline and the TWTA, and two end-of-lab handoffs break the learning path. These are small fixes.

## Reproduced findings

**1. Major: three labs teach different lock rules.**
- Did: compared the same margins in each model.
- Saw: Interference calls any negative margin **Lost** (−1.15 dB is Lost). DVB-S2 and Troubleshooter call 0 to −3 dB **Demod locked, FEC failing**. At Es/N0 11.0 dB on 16APSK 3/4 (+0.8 dB), DVB-S2 stays Searching for 10 s from a fresh search, while Troubleshooter shows Locked.
- Why: "demod locked, FEC failing" is the suite's key field diagnosis.
- Correct behavior: PLHEADER is robust and acquires well below the payload threshold, so Troubleshooter is closer (high confidence).
- Fix: use one shared receiver-state rule, and add the FEC-failing state to Interference.
- `interference/src/model.js:109`, `dvbs2/src/model.js:56`, `troubleshoot/src/model.js:32-33`

**2. Major: "SatLab-1" has different link numbers in each lab.**
- Did: followed Interference lesson 1's link, "See where this Es/N0 comes from."
- Saw: same satellite and MODCOD, but Es/N0 is **16.7 dB** in Interference and **17.9 dB** in Link Budget. Margin is 6.5 vs 7.7, downlink C/N 20.0 vs 21.7, IBO 5.9 vs 6.8, Tsys 150 K vs 110 K. DVB-S2 shows 16.0 dB on 8PSK 2/3.
- Fix: derive Interference's constants from the Link Budget defaults, or say plainly that each lab uses a different carrier.
- `interference/src/model.js:9`, `interference/src/lessons.js:12`, `linkbudget/src/model.js:11-16`

**3. Major: the TWTA differs between Mixer Lab and later labs.**
- Saw at 6 dB IBO: Mixer gives OBO 3.0 dB and C/IM 19.0 dB. Link Budget and Interference give 1.9 dB and 23 dB. At about 0.2 dB IBO, Mixer shows 1.0 dB OBO and the shared curve shows about 0.
- Why: Link Budget lesson 11 sends learners to Mixer to "see the tube saturate."
- Fix: drive both from one curve, or state the two-tone versus total-power reference on screen.
- `mixers/src/model.js:49,224`, `lib/twta.js:2-4`

**4. Major: two end-of-lab handoffs break the order.**
- Saw: Interference's last lesson offers only Field Troubleshooter, skipping lab 5. DVB-S2's last lesson shows no next link.
- Fix: render the related link and the next-lab link together, and pass `isLast` from DVB-S2.
- `lib/suite.js:201`, `dvbs2/src/main.js:122`, `interference/src/lessons.js:84`

**5. Major: the glossary omits core suite vocabulary.**
- Saw: missing **transponder** (used in 5 labs), **IQ**, **constellation**, CW, L-band, symbol rate, compression, hysteresis, spectral inversion, BUC, dBW, NOC, CID. Plurals such as "side lobes" and "MODCODs" do not link.
- Fix: add these terms and match simple plurals.
- `lib/suite.js:11-48,66`

**6. Major: IQ is explained after it is needed.**
- Saw: Link Budget lesson 8 relies on MER "measured from the constellation," with no constellation on screen. Interference lesson 7 uses dots and crosses. The basic explanation arrives in DVB-S2 lesson 2, yet the landing page says DVB-S2 builds on IQ from Interference.
- Fix: move that explanation into Interference before lesson 7, and keep a recap in DVB-S2.

**7. Major: on a phone, the glossary's Close button scrolls away.**
- Did: tapped a term in each of the 5 labs that showed one at 390 px.
- Saw: the dialog scrolled 509-1737 px and Close was out of view every time. The visible exit is a 17 px backdrop strip.
- Fix: make `.suiteTerms .head` sticky.
- `lib/suite.js:91`

**8. Minor: the spectral inversion link is a dead end.** Mixer's "See where a receiver depends on this" opens DVB-S2, which never mentions inversion. Point it to `/troubleshoot/?lesson=5`. `mixers/src/lessons.js:52`

**9. Minor: pointing tolerance disagrees with Peaker.** Link Budget says the link closes to 1.24°, while Peaker's pattern gives 1.15°. At one beamwidth the loss is 12 vs 15.2 dB. Use `gainDbi`. `linkbudget/src/model.js:30`

**10. Minor: text errors.**
- "The tradeoff is the last lesson" is in lesson 13 of 18 and means the previous lesson. `interference/src/lessons.js:63`
- The Es/(N+I) entry says a receiver "cannot tell the two apart," while Interference teaches rings versus clouds. `lib/suite.js:22`

**11. Minor: stale docs and boundaries.**
- ROADMAP lists 4 tools, omits Link Budget and Troubleshooter, and still lists the finished learning path as an idea.
- README lists Troubleshooter before Interference.
- `linkbudget/src/model.js:4-5` imports from `peaker/src/`, against ROADMAP's rule that shared code moves to `lib/`.

**12. Minor: ship hygiene.**
- `linkbudget/` and `troubleshoot/` are untracked, while the modified `vite.config.js` requires their HTML. Commit them together or the build breaks.
- `.wrangler/` is not ignored. It holds no files today.
- By reading: all 7 entries exist, and all 58 relative imports in `lib/` and the lab `src/` folders resolve with exact case.

**13. Minor: phone Next link is only 17 px tall.** `lib/suite.js:86`

## Opinions

- The high-side LNB example uses a 14250 MHz LO, inside the Ku uplink band. A C-band 5150 MHz LNB is the example technicians will recognize (medium-high confidence).
- Troubleshooter should end with a short completion and recap state.

## Earlier findings

- **Fixed:** 1 near the cliff, 2 transponder disagreement, 3 backoff direction, 6 beacon data, 7 carrier continuity. Items 1, 2, 6 and 7 were checked mainly from source.
- **Partly fixed:** 4 lock behavior (see finding 1), 5 learning path (finding 4), 8 progress (deep links work, but returning without a URL restarts at lesson 1).
- **9, partly fixed:** Marginal is now consistent and MODCOD lists are shared, but Lost versus FEC failing and the SatLab-1 baselines still conflict.
- **10, partly fixed:** MODCOD and relock values are shared. The partial-commit risk has returned with the two new untracked labs.

## Unanswered questions

1. How do I convert an analyzer's (C+N)/N reading to Es/N0?
2. How do I set polarization skew and verify cross-pol isolation?
3. What does LO phase noise or drift do to the constellation?
4. How does adaptive coding behave during a fade?
5. How does uplink power control respond to rain, and what are its risks?
6. How is a real multi-carrier backoff chosen from an operator's plan?
7. Which reading should I check first on a real modem?

## Must keep

- Lessons written from live model values.
- Reliable `?lesson=` deep links with safe fallback.
- The numbered landing path with "Builds on" lines.
- The Troubleshooter report and escalation flow.
- Fictional satellites and defensive boundaries.

## Could not test

Real phones, screen readers, live third-party data, the production build or deployed site, and every Diagnose ticket. I ran `node --test` but not the build, and changed nothing in the repo. Physics was checked by calculation and cross-lab comparison, not against measured equipment.
