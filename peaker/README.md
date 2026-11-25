# Peaker

A browser simulator for pointing and peaking a ground antenna on a real satellite. Pick a satellite, ground station, dish size and band, then find the beacon on a spectrum analyzer and waterfall by hand, or with auto-peak and step-track.

**Try it: [satlab.steckley.xyz/peaker](https://satlab.steckley.xyz/peaker/)**. Peaker is the first lab in [SatLab](../README.md).

## Run

```sh
npm install
npm run dev
```

Then open http://localhost:5173/peaker/. Run these commands from the SatLab root.

Other commands:

- `npm test` runs the physics, parser and controller tests.
- `npm run build` creates a static site in `dist/`.
- `npm run data` rebuilds `public/data/`. Responses are cached in `.cache/`, so delete that folder to fetch fresh data. A full crawl takes several minutes because it deliberately paces its requests.

## How it works

**Orbit.** SGP4 via `satellite.js`, using CelesTrak elements. The app ships a catalog snapshot and fetches fresh elements for the selected satellite, cached for two hours.

**Beacon.** The app looks in this order and always shows which source it used:

1. Frequency Plan Satellites beacon and telemetry tables.
2. SatNOGS DB downlinks, preferring CW and beacon transmitters.
3. A generated frequency inside the band, labeled "Estimated".

**Antenna.** Gain is `eta (pi D / lambda)^2` with Ruze surface loss. The pattern is the far field of a parabola-on-pedestal aperture with a 10 dB edge taper and 8% central blockage, so nulls and side lobes move correctly with dish size and frequency. A scatter floor of -13 dBi fills the far nulls. The ITU-R S.580 envelope is drawn for reference.

**Signal.** Received power is EIRP minus free-space and clear-sky atmospheric loss, plus antenna gain at the true off-axis angle. Noise is kTB. Doppler comes from the orbit's range rate.

**Auto control.** The controllers see only measured beacon power and their own commanded position. Auto-peak runs a spiral or raster search, moves to the strongest point and refines with three-point fits. Step-track repeats those fits on a configurable interval. The "How it works" panel explains each step live and plots az, el and beacon level over time.

## What is modeled rather than real

- Beacon EIRP (14 dBW GEO, 0 dBW otherwise), transponder EIRP and occupancy, and system noise temperature are typical values.
- Transponder frequencies and bandwidths come from published plans, but the traffic inside them is simulated.
- Rain fade, adjacent-satellite interference and polarization skew are not simulated.

## Data sources

- Orbital elements: [CelesTrak](https://celestrak.org)
- Beacons and transponder plans: [Frequency Plan Satellites](http://frequencyplansatellites.altervista.org/)
- Transmitters: [SatNOGS DB](https://db.satnogs.org)
