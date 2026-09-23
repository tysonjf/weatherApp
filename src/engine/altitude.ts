/**
 * Altitude. Dough rises on gas, and gas expands as the air pressure drops: at 1,500 m the same CO₂
 * takes ~20 % more room, so a dough "doubles" on ~17 % less fermentation. That matches the rule of
 * thumb of cutting yeast 10–25 % above ~1,000 m (Colorado State University Extension).
 */
export function pressureRatio(altitudeM: number): number {
  const h = Math.max(-400, Math.min(6000, altitudeM || 0))
  // Standard atmosphere.
  return Math.pow(1 - 2.25577e-5 * h, 5.25588)
}
