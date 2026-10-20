/** Implied probabilities from decimal odds, normalised to 100 % (the bookmaker's margin is removed). */
export function impliedProb(odds: (number | null)[]): number[] {
  const inv = odds.map((x) => (x ? 1 / x : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => Math.round((x / s) * 100));
}
