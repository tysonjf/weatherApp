export type TempUnit = 'C' | 'F'
export type WeightUnit = 'g' | 'oz'

export const cToF = (c: number): number => (c * 9) / 5 + 32
export const fToC = (f: number): number => ((f - 32) * 5) / 9
/** Converts a temperature *difference* (not an absolute temperature). */
export const deltaCToF = (dc: number): number => (dc * 9) / 5
export const deltaFToC = (df: number): number => (df * 5) / 9

export const GRAMS_PER_OZ = 28.349523125
export const gToOz = (g: number): number => g / GRAMS_PER_OZ
export const ozToG = (oz: number): number => oz * GRAMS_PER_OZ

export const CM_PER_IN = 2.54
export const G_PER_CM2_PER_OZ_PER_IN2 = GRAMS_PER_OZ / (CM_PER_IN * CM_PER_IN)

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value
  const r = Math.round(value / step) * step
  // Kill floating point dust such as 0.30000000000000004.
  return Number(r.toFixed(Math.max(0, Math.ceil(-Math.log10(step)) + 1)))
}

/** Sensible kitchen precision for a weight in grams. */
export function gramStep(g: number): number {
  const a = Math.abs(g)
  if (a < 1) return 0.01
  if (a < 10) return 0.1
  if (a < 100) return 0.5
  return 1
}

export function formatNumber(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '—'
  const fixed = value.toFixed(maxDecimals)
  // Trim trailing zeros but keep at least an integer.
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

export function formatWeight(g: number, unit: WeightUnit = 'g'): string {
  if (!Number.isFinite(g)) return '—'
  if (unit === 'oz') {
    const oz = gToOz(g)
    const decimals = Math.abs(oz) < 0.1 ? 3 : Math.abs(oz) < 10 ? 2 : 1
    return `${formatNumber(oz, decimals)} oz`
  }
  const step = gramStep(g)
  const decimals = step >= 1 ? 0 : step >= 0.5 ? 1 : step >= 0.1 ? 1 : 2
  return `${formatNumber(roundTo(g, step), decimals)} g`
}

export function formatTemp(c: number, unit: TempUnit = 'C', decimals = 1): string {
  if (!Number.isFinite(c)) return '—'
  return unit === 'F' ? `${formatNumber(cToF(c), decimals)}°F` : `${formatNumber(c, decimals)}°C`
}

/**
 * Static copy is written in °C. For °F readers, rewrite absolute temperatures such as "18 °C" or
 * "18–21 °C" (oven temperatures rounded to 5 °F). Temperature *differences* must not go through
 * this — render those with formatTempDelta.
 */
export function localizeTemps(text: string, unit: TempUnit): string {
  if (unit === 'C' || !text.includes('°C')) return text
  const f = (s: string) => {
    const v = cToF(parseFloat(s))
    return formatNumber(v >= 212 ? Math.round(v / 5) * 5 : Math.round(v), 0)
  }
  return text.replace(/(-?\d+(?:\.\d+)?)(?:(\s*[–-]\s*)(-?\d+(?:\.\d+)?))?(\s?)°C/g, (_m, a: string, dash?: string, b?: string, sp?: string) =>
    b !== undefined ? `${f(a)}${dash}${f(b)}${sp}°F` : `${f(a)}${sp}°F`,
  )
}

export function formatTempDelta(dc: number, unit: TempUnit = 'C', decimals = 1): string {
  return unit === 'F' ? `${formatNumber(deltaCToF(dc), decimals)}°F` : `${formatNumber(dc, decimals)}°C`
}

export function formatPct(p: number, maxDecimals?: number): string {
  if (!Number.isFinite(p)) return '—'
  const decimals = maxDecimals ?? (Math.abs(p) < 0.1 ? 3 : Math.abs(p) < 1 ? 2 : 1)
  return `${formatNumber(p, decimals)}%`
}

export function formatHours(h: number): string {
  if (!Number.isFinite(h)) return '—'
  const totalMin = Math.round(h * 60)
  const d = Math.floor(totalMin / (24 * 60))
  const hh = Math.floor((totalMin % (24 * 60)) / 60)
  const mm = totalMin % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (hh) parts.push(`${hh}h`)
  if (mm || parts.length === 0) parts.push(`${mm}m`)
  return parts.join(' ')
}
