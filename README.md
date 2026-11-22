# SatLab

Interactive browser simulators for learning satellite communications.

- [Peaker](peaker/README.md): point and peak a ground antenna on a real satellite.
- Mixer Lab (`mixers/`): mixing products, spurs, compression and intermodulation through a satellite link.
- Interference Lab (`interference/`): how interference affects a fictional satellite link, and how operators diagnose and respond to it.

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
