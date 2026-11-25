# SatLab

Interactive browser simulators for learning satellite communications, written for working RF and satcom technicians.

**Try it: [satlab.steckley.xyz](https://satlab.steckley.xyz)**

The labs build on each other, so work through them in order:

1. [Peaker](https://satlab.steckley.xyz/peaker/) (`peaker/`): point and peak a ground antenna on a real satellite. Find its beacon on a spectrum analyzer and waterfall, check for side lobes, and step through how auto-peak and step-track work. See [peaker/README.md](peaker/README.md).
2. [Mixer Lab](https://satlab.steckley.xyz/mixers/) (`mixers/`): follow signals through a bench mixer and a full satellite link. See images, spurs, spectral inversion, compression and third-order products on a movable spectrum analyzer.
3. [Link Budget Lab](https://satlab.steckley.xyz/linkbudget/) (`linkbudget/`): follow one carrier from the HPA to the demodulator. See where Es/N0 comes from, how the noise terms add, and how to choose backoff, margin and MODCOD.
4. [Interference Lab](https://satlab.steckley.xyz/interference/) (`interference/`): see how CW, modulated, swept, partial-band and wideband interference affect a fictional satellite link, and how rain, mispointing, cross-pol, adjacent satellites and power robbing differ. Guided experiments, diagnose-it trouble tickets and a sandbox.
5. [DVB-S2 Overlay Lab](https://satlab.steckley.xyz/dvbs2/) (`dvbs2/`): follow video through a full broadcast chain, then watch a second signal degrade the receiver, break lock and capture it, and see how operators detect and defend against it. Simulated signals only.
6. [Field Troubleshooter](https://satlab.steckley.xyz/troubleshoot/) (`troubleshoot/`): work tickets on a modem that will not lock, then write a clear interference report and learn who to call. This lab is still in work and has known bugs.

Each lab has guided steps that highlight what they talk about, a glossary of terms, and links to related steps in other labs. The Interference and DVB-S2 labs list their sources.

## Report a problem

Found a bug, or something that is wrong or unclear? Use **Report an issue** at the top of any lab, or [open an issue](https://github.com/the-steckles/satlab/issues/new). The lab's link fills in the lab and step you were on.

## Safety

The Interference and DVB-S2 labs teach how links fail and how operators find and fix the cause. They use a fictional satellite and relative levels, have no real bitstream encoder, and produce no IQ files or anything that could drive a transmitter. Interfering with satellite communications is illegal.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:5173/. `npm test` runs every lab's tests, and `npm run build` creates the static site in `dist/`. `npm run data` refreshes Peaker's satellite data (see [peaker/README.md](peaker/README.md)).

## Layout

- One folder per lab, each with `index.html`, `src/` and `test/`.
- `lib/` holds code shared by more than one lab: the suite header and glossary, the receiver lock rule, the TWTA model, MODCOD thresholds, constellations and plotting helpers.
- `public/data/` holds Peaker's satellite, beacon and transponder snapshots.
- `docs/` holds the [roadmap](docs/ROADMAP.md), each lab's design plan and the independent review reports.

## Deploy

The site is static and served by Cloudflare Workers.

```sh
npm run build
npx wrangler@4 deploy
```

`redirects/` holds the small Worker that sends the old `peaker.steckley.xyz` address to `/peaker/`.

## Data sources

Peaker uses orbital elements from [CelesTrak](https://celestrak.org), beacon and transponder plans from [Frequency Plan Satellites](http://frequencyplansatellites.altervista.org/), and transmitters from [SatNOGS DB](https://db.satnogs.org). The other labs use fictional satellites.
