import { degreesToRadians, ecfToLookAngles, eciToEcf, geodeticToEcf, eciToGeodetic, gstime, json2satrec, propagate } from 'satellite.js';

const toDeg = (r) => (r * 180) / Math.PI;
export const makeSatrec = (omm) => json2satrec(omm);
export const isGeostationary = (omm) => Math.abs(omm.MEAN_MOTION - 1.0027) < 0.05 && omm.ECCENTRICITY < 0.05;

// Above this, a fixed narrow beam loses the satellite over a day.
export const isInclinedGeo = (omm) => isGeostationary(omm) && omm.INCLINATION >= 0.5;
export const orbitName = (omm) => (isInclinedGeo(omm) ? `Inclined GEO (${omm.INCLINATION.toFixed(2)}°)` : isGeostationary(omm) ? 'Geostationary' : omm.MEAN_MOTION > 11 ? 'LEO' : omm.MEAN_MOTION > 1.5 ? 'MEO / HEO' : 'High orbit');

const observer = ({ lat, lon, altM }) => ({
  latitude: degreesToRadians(lat),
  longitude: degreesToRadians(lon),
  height: altM / 1000,
});

function ecfAt(satrec, date) {
  const state = propagate(satrec, date);
  if (!state?.position) return null;
  return eciToEcf(state.position, gstime(date));
}

export function look(satrec, station, date) {
  const obs = observer(station);
  const pos = ecfAt(satrec, date);
  const next = ecfAt(satrec, new Date(date.getTime() + 1000));
  if (!pos || !next) return null;
  const site = geodeticToEcf(obs);
  const range = (p) => Math.hypot(p.x - site.x, p.y - site.y, p.z - site.z);
  const a = ecfToLookAngles(obs, pos);
  return { az: (toDeg(a.azimuth) + 360) % 360, el: toDeg(a.elevation), rangeKm: range(pos), rangeRateKmS: range(next) - range(pos) };
}

export function subLongitude(satrec, date) {
  const state = propagate(satrec, date);
  if (!state?.position) return null;
  return toDeg(eciToGeodetic(state.position, gstime(date)).longitude);
}

// The satellite's path over one day, centered on its average position.
export function dailyMotion(satrec, station, from, points = 96) {
  const looks = [];
  for (let i = 0; i <= points; i++) {
    const l = look(satrec, station, new Date(from.getTime() + (i / points) * 86164e3));
    if (l) looks.push(l);
  }
  const firstAz = looks[0].az, unwrap = (az) => firstAz + (((az - firstAz + 540) % 360) - 180);
  const centerAz = looks.reduce((sum, l) => sum + unwrap(l.az), 0) / looks.length, centerEl = looks.reduce((sum, l) => sum + l.el, 0) / looks.length;
  const cosEl = Math.cos((centerEl * Math.PI) / 180);
  const rows = looks.map((l) => ({ x: (unwrap(l.az) - centerAz) * cosEl, y: l.el - centerEl }));
  return { rows, centerAz: ((centerAz % 360) + 360) % 360, centerEl, peakDeg: Math.max(...rows.map((r) => Math.hypot(r.x, r.y))) };
}

// Coarse scan then refine, so a short LEO pass is not stepped over.
export function nextPass(satrec, station, from, minEl = 5, horizonHours = 72) {
  const stepMs = 30000;
  const end = from.getTime() + horizonHours * 3600000;
  for (let t = from.getTime(); t < end; t += stepMs) {
    const l = look(satrec, station, new Date(t));
    if (l && l.el >= minEl) {
      let lo = t - stepMs, hi = t;
      while (hi - lo > 1000) {
        const mid = (lo + hi) / 2;
        const m = look(satrec, station, new Date(mid));
        if (m && m.el >= minEl) hi = mid; else lo = mid;
      }
      return new Date(hi);
    }
  }
  return null;
}
