/**
 * Dough temperature over time.
 *
 * Dough does not jump to fridge temperature: a 250 g ball in a lightly covered container
 * takes ~3–4 h to fall from 24 °C to 8 °C and a 2 kg bulk tub 7–9 h (lumped Newton cooling,
 * validated against Lehmann's walk-in cooler data for 454 g balls). Because yeast activity is
 * strongly non-linear in temperature, those first warm hours in the fridge carry a large share
 * of the fermentation — ignoring them is the classic reason cold-fermented dough over-proofs.
 *
 * Model: dT/dt = (T_env − T_dough) / τ with τ scaling with the piece's radius (∝ m^⅓).
 * τ(250 g) ≈ 2.0 h (between a loosely covered tray and a closed box), giving τ(2 kg tub) ≈ 4 h.
 */

export interface ThermalSegment {
  /** Environment temperature (°C). */
  envC: number
  hours: number
  /** Mass of each individual piece in this segment (a ball, or the whole bulk). */
  pieceMassG: number
  /** Optional time-varying environment (hours since the segment started), e.g. a room that cools at night. */
  envAt?: (tH: number) => number
}

export interface TempSample {
  /** Hours since the start of the simulation. */
  t: number
  doughC: number
  envC: number
  segment: number
}

/** Thermal time constant (hours) for a piece of dough of the given mass. */
export function tauHours(pieceMassG: number): number {
  const m = Math.max(20, pieceMassG)
  return Math.min(10, Math.max(0.4, 2.0 * Math.cbrt(m / 250)))
}

/** Exact exponential approach towards the environment over dt hours. */
export function stepTemp(doughC: number, envC: number, dtH: number, tau: number): number {
  return envC + (doughC - envC) * Math.exp(-dtH / tau)
}

/**
 * Walks through segments and yields dough temperatures at sub-step midpoints.
 * `visit(dtH, doughC, segmentIndex)` is called for each slice with the mean dough temperature
 * over that slice. Returns the dough temperature at the end.
 */
export function walkThermal(
  segments: ThermalSegment[],
  startC: number,
  visit: (dtH: number, meanDoughC: number, segment: number) => void,
  maxStepH = 0.25,
): number {
  let T = startC
  segments.forEach((seg, i) => {
    if (seg.hours <= 0) return
    const tau = tauHours(seg.pieceMassG)
    const n = Math.max(1, Math.ceil(seg.hours / maxStepH))
    const dt = seg.hours / n
    for (let k = 0; k < n; k++) {
      const next = stepTemp(T, seg.envC, dt, tau)
      // Mean of an exponential over the slice (exact for the linear ODE).
      const decay = Math.exp(-dt / tau)
      const mean = seg.envC + ((T - seg.envC) * tau * (1 - decay)) / dt
      visit(dt, mean, i)
      T = next
    }
  })
  return T
}

/** Temperature curve for charts. */
export function temperatureCurve(segments: ThermalSegment[], startC: number, stepH = 0.25): TempSample[] {
  const out: TempSample[] = [{ t: 0, doughC: startC, envC: segments[0]?.envC ?? startC, segment: 0 }]
  let t = 0
  let T = startC
  segments.forEach((seg, i) => {
    if (seg.hours <= 0) return
    const tau = tauHours(seg.pieceMassG)
    const n = Math.max(1, Math.ceil(seg.hours / stepH))
    const dt = seg.hours / n
    for (let k = 0; k < n; k++) {
      T = stepTemp(T, seg.envC, dt, tau)
      t += dt
      out.push({ t, doughC: T, envC: seg.envC, segment: i })
    }
  })
  return out
}

/** Hours for a piece to warm (or cool) from `fromC` to within `toC` in an environment at `envC`. */
export function hoursToReach(fromC: number, toC: number, envC: number, pieceMassG: number): number {
  const tau = tauHours(pieceMassG)
  const num = toC - envC
  const den = fromC - envC
  if (den === 0) return 0
  const ratio = num / den
  if (ratio <= 0) return Infinity
  if (ratio >= 1) return 0
  return -tau * Math.log(ratio)
}
