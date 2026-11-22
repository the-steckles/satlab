// Saleh TWTA curve in power, normalized so 0 dB input backoff is exactly saturation. Held flat past it.
export const twtaOutput = (drive) => (drive >= 1 ? 1 : (4 * drive) / (1 + drive) ** 2);
