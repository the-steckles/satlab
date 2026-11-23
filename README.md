# SatLab

Interactive browser simulators for learning satellite communications.

- [Peaker](peaker/README.md): point and peak a ground antenna on a real satellite.
- Mixer Lab (`mixers/`): mixing products, spurs, compression and intermodulation through a satellite link.
- Link Budget Lab (`linkbudget/`): an end-to-end budget from HPA to demodulator, with backoff, margin and MODCOD choice.
- Interference Lab (`interference/`): how interference affects a fictional satellite link, and how operators diagnose and respond to it.
- DVB-S2 Overlay Lab (`dvbs2/`): a full video-to-receiver chain showing degradation, loss of lock, capture and defenses, with simulated signals only.
- Field Troubleshooter (`troubleshoot/`): practice finding why a carrier will not lock, and build an interference report.

Plans and ideas for future tools are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173/. `npm test` runs every simulator's tests, and `npm run build` creates the static site in `dist/`.

## Deploy

```sh
npm run build
npx wrangler@4 deploy
```

`redirects/` holds the small Worker that sends the old `peaker.steckley.xyz` address to `/peaker/`.
