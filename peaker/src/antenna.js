// Circular reflector pattern from aperture theory. All angles in degrees.
const C_M_S = 299792458;
const EDGE_TAPER_DB = 10;
const BLOCKAGE_RATIO = 0.08; // feed diameter / dish diameter
const BASE_EFFICIENCY = 0.68;
const ENVELOPE_FLOOR_DBI = -10;
const SCATTER_FLOOR_DBI = -13; // typical measured level, below the S.465 worst-case envelope

export const wavelengthM = (freqHz) => C_M_S / freqHz;

// Numerical Recipes rational approximations, accurate to about 1e-8.
export function besselJ0(x) {
  const a = Math.abs(x);
  if (a < 8) {
    const y = x * x;
    return (57568490574 + y * (-13362590354 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))))) /
      (57568490411 + y * (1029532985 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y)))));
  }
  const z = 8 / a, y = z * z, xx = a - 0.785398164;
  const p = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const q = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / a) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
}

export function besselJ1(x) {
  const a = Math.abs(x);
  if (a < 8) {
    const y = x * x;
    return x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606))))) /
      (144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y)))));
  }
  const z = 8 / a, y = z * z, xx = a - 2.356194491;
  const p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  return Math.sign(x) * Math.sqrt(0.636619772 / a) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
}

const lambda1 = (u) => (Math.abs(u) < 1e-6 ? 1 : (2 * besselJ1(u)) / u);
// 8 J2(u) / u^2, with the series near zero where the recurrence loses precision.
const lambda2 = (u) => {
  if (Math.abs(u) < 0.01) return 1 - (u * u) / 12;
  return (8 * ((2 * besselJ1(u)) / u - besselJ0(u))) / (u * u);
};

const PEDESTAL = 10 ** (-EDGE_TAPER_DB / 20);
const FIELD_0 = (1 + PEDESTAL) / 2 - BLOCKAGE_RATIO ** 2;

// Normalized far field of a parabola-on-pedestal aperture minus the feed's shadow.
export function fieldPattern(u) {
  const b = BLOCKAGE_RATIO;
  return (PEDESTAL * lambda1(u) + ((1 - PEDESTAL) / 2) * lambda2(u) - b * b * lambda1(b * u)) / FIELD_0;
}

export function peakGainDbi(diameterM, freqHz) {
  const lambda = wavelengthM(freqHz);
  const rmsM = 0.00025 * Math.sqrt(diameterM); // larger dishes hold surface accuracy less well
  const ruze = Math.exp(-(((4 * Math.PI * rmsM) / lambda) ** 2));
  return 10 * Math.log10(BASE_EFFICIENCY * ruze * ((Math.PI * diameterM) / lambda) ** 2);
}

export function gainDbi(offAxisDeg, diameterM, freqHz) {
  const peak = peakGainDbi(diameterM, freqHz);
  const theta = Math.abs(offAxisDeg);
  if (theta >= 90) return SCATTER_FLOOR_DBI;
  const u = ((Math.PI * diameterM) / wavelengthM(freqHz)) * Math.sin((theta * Math.PI) / 180);
  const f = fieldPattern(u);
  // Scatter fills the ideal pattern's nulls, so sum powers with the far floor.
  return 10 * Math.log10(10 ** (peak / 10) * f * f + 10 ** (SCATTER_FLOOR_DBI / 10));
}

export function beamwidthDeg(diameterM, freqHz) {
  const peak = gainDbi(0, diameterM, freqHz);
  let lo = 0, hi = Math.min(90, (200 * wavelengthM(freqHz)) / diameterM);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (gainDbi(mid, diameterM, freqHz) > peak - 3) lo = mid; else hi = mid;
  }
  return 2 * lo;
}

// ITU-R S.580 side-lobe envelope, continuing into the S.465 far-out region.
export function envelopeDbi(thetaDeg) {
  if (thetaDeg <= 20) return 29 - 25 * Math.log10(thetaDeg);
  if (thetaDeg <= 26.3) return -3.5;
  if (thetaDeg <= 48) return 32 - 25 * Math.log10(thetaDeg);
  return ENVELOPE_FLOOR_DBI;
}

export const envelopeStartDeg = (diameterM, freqHz) => Math.max(1, (100 * wavelengthM(freqHz)) / diameterM);
export const isModelReliable = (diameterM, freqHz) => diameterM / wavelengthM(freqHz) >= 10;

// Exact angle between two az/el look directions.
export function offAxisDeg(az1, el1, az2, el2) {
  const r = Math.PI / 180;
  const dAz = (az1 - az2) * r;
  const a = Math.sin(((el1 - el2) * r) / 2) ** 2 + Math.cos(el1 * r) * Math.cos(el2 * r) * Math.sin(dAz / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / r;
}
