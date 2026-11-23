// Saleh TWTA curve in power, normalized so 0 dB input backoff is exactly saturation. Held flat past it.
export const twtaOutput = (drive) => (drive >= 1 ? 1 : (4 * drive) / (1 + drive) ** 2);
// shortcut: typical two-carrier C/IM, 11 dB at saturation and improving 2 dB per dB of backoff. Replace with a measured tube curve if one is ever available.
export const carrierToImDb = (drive) => Math.max(9, 11 - 20 * Math.log10(drive));
