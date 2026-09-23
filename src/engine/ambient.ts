/**
 * Room temperature through the day.
 *
 * Homes without climate control drift between a mid-afternoon high and a pre-dawn low. A cosine
 * between the two (warmest ~15:00, coolest ~03:00) is a good first-order model for a kitchen;
 * with no night temperature set the room is treated as constant.
 */
export const WARMEST_HOUR = 15

/** Room temperature at a moment (epoch ms, local clock) given the day (warmest) and night (coolest) values. */
export function roomTempAt(ms: number, dayC: number, nightC: number | null | undefined): number {
  if (nightC === null || nightC === undefined || Math.abs(nightC - dayC) < 0.05) return dayC
  const d = new Date(ms)
  const h = d.getHours() + d.getMinutes() / 60
  const mid = (dayC + nightC) / 2
  const amp = (dayC - nightC) / 2
  return mid + amp * Math.cos((2 * Math.PI * (h - WARMEST_HOUR)) / 24)
}
