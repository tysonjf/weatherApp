/**
 * Fermentation model — every leavening agent expressed as "progress per hour" at the dough's
 * actual (simulated) temperature, so any multi-phase room / fridge / cellar schedule works.
 *
 * 1. Commercial yeast — Craig's (TXCraig1, pizzamaking.com) chart: hours to his end point for 27
 *    fresh-yeast levels × 61 temperatures (35–95 °F). It is separable to within rounding:
 *
 *        H(Y, T) = H1(T) · Y^(−0.728)     (Y = fresh yeast % of flour)
 *
 *    so temperature only changes the speed r(T) = H1(21 °C) / H1(T), and a schedule collapses to
 *    "equivalent hours at 21 °C". ln H1 is fitted with a quartic in °C (≈ 2 % error).
 *    Q10 ≈ 4 between 5 and 25 °C: a 4 °C fridge runs at ~8 % of 21 °C, matching the Italian
 *    rule of thumb "1 h in the fridge ≈ 0.1 h at room temperature".
 *
 * 2. Dough composition — relative yeast need from the Italian Calcolapizza ("Japi") formula terms:
 *    (1 + S/200)(1 + G/300) / (4.2·I − 80 − 0.0305·I²), salt S and fat G in g per litre of water.
 *
 * 3. Biga — MasterBiga's maturation law (as reverse-engineered by RafCalc): with 1 % fresh yeast a
 *    biga is ripe after K(H)/T hours, K = 370 − 5.81·(H − 40) (H = biga hydration %, T in °C,
 *    valid 12–35 °C). Colder than 12 °C it follows Craig's speed curve. Other yeast doses scale
 *    with Craig's exponent.
 *
 * 4. Poolish — the Italian "Juju" / Calvel table at 21 °C (3.5 % → 1 h … 0.1 % → 16 h).
 *
 * 5. Sourdough — Craig's sourdough chart: starter % = 89.4 · 2^(−Σ tᵢ / D(Tᵢ)), where D is the
 *    doubling time of the required inoculation (5.1 h at 21 °C, optimum ≈ 28 °C). Levain builds
 *    (no salt) run ~1.6× faster; a 1 : 1 : 1 feed peaks after ≈ 1.95 build doublings
 *    (≈ 6 h at 21 °C, 4.5 h at 24 °C).
 */
import { tauHours, type ThermalSegment } from './thermal'

export const REF_C = 21

/* ------------------------------------------------------------------ */
/* Commercial yeast (Craig)                                            */
/* ------------------------------------------------------------------ */

/** Yeast exponent: H ∝ Y^(−B). */
export const B = 0.728397214164927
const P4 = [6.447582544737171e-6, -0.0004479630187699247, 0.011273610666424403, -0.2613392358382555, 4.663467910392636]
const T_LO = 1.667
const T_HI = 35
const SLOPE_LO = -0.22737 // d lnH1/dT at the cold end of the chart

const poly = (t: number) => P4.reduce((acc, c) => acc * t + c, 0)

/** ln H1(T): hours for 1 % fresh yeast to reach Craig's end point at T (°C). */
export function lnH1(tC: number): number {
  if (tC < T_LO) return poly(T_LO) + SLOPE_LO * (tC - T_LO)
  if (tC > T_HI) {
    // Yeast is stressed above ~35 °C and dies off towards ~45–50 °C.
    const decline = Math.max(0.02, (45 - tC) / 10)
    return poly(T_HI) - Math.log(decline)
  }
  return poly(tC)
}

const LN_REF = lnH1(REF_C)
/** Hours for 1 % fresh yeast at 21 °C (≈ 3.5 h). */
export const H1_REF = Math.exp(LN_REF)

/** Yeast fermentation speed at tC relative to 21 °C. */
export function rateAt(tC: number): number {
  return Math.exp(LN_REF - lnH1(tC))
}

/** Hours for fresh-yeast % y to reach Craig's end point at a constant tC. */
export function craigHours(yFreshPct: number, tC: number): number {
  return Math.exp(lnH1(tC)) * Math.pow(yFreshPct, -B)
}

/* ------------------------------------------------------------------ */
/* Dough composition factor                                            */
/* ------------------------------------------------------------------ */

export interface DoughFactors {
  hydration: number
  saltPct: number
  oilPct: number
  sugarPct: number
}

/** Craig's chart is used with Neapolitan-style doughs (~60–65 % water, ~2.8 % salt). */
const REF_DOUGH: DoughFactors = { hydration: 63, saltPct: 2.8, oilPct: 0, sugarPct: 0 }

function japiTerm(f: DoughFactors): number {
  // The hydration quadratic peaks at 68.9 % — wetter doughs are treated as equal.
  const I = Math.min(68.9, Math.max(40, f.hydration))
  const perLitre = 1000 / Math.max(1, f.hydration)
  const S = f.saltPct * perLitre
  const G = f.oilPct * perLitre
  const hyd = 4.2 * I - 80 - 0.0305 * I * I
  // High sugar slows yeast osmotically (≈ +4 % yeast per % above 5 %).
  const sugar = 1 + Math.max(0, f.sugarPct - 5) * 0.04
  return ((1 + S / 200) * (1 + G / 300) * sugar) / hyd
}

const REF_TERM = japiTerm(REF_DOUGH)

/** Multiplier on the yeast needed relative to the reference dough (1 = same). */
export function doughMultiplier(f: DoughFactors): number {
  return japiTerm(f) / REF_TERM
}

/** Salt-only multiplier for preferments that have their own curve (biga, poolish). */
export function saltMultiplier(saltPct: number, hydration: number): number {
  const S = (saltPct * 1000) / Math.max(1, hydration)
  return 1 + S / 200
}

/* ------------------------------------------------------------------ */
/* Dough & poolish curves                                              */
/* ------------------------------------------------------------------ */

export type CurveId = 'dough' | 'poolish'

/** Juju / Calvel poolish table: fresh yeast % of poolish flour vs hours at 21 °C. */
const POOLISH_TABLE: [number, number][] = [
  [1, 3.5],
  [2, 2.5],
  [3, 1.5],
  [4, 1.13],
  [6, 0.73],
  [7, 0.6],
  [8, 0.49],
  [10, 0.3],
  [12, 0.175],
  [14, 0.12],
  [16, 0.1],
]
const POOLISH_LN = POOLISH_TABLE.map(([h, y]) => [Math.log(h), Math.log(y)] as const)

function poolishYeast(eqH: number): number {
  const x = Math.log(Math.max(0.05, eqH))
  const pts = POOLISH_LN
  if (x <= pts[0][0]) return Math.exp(pts[0][1] - (x - pts[0][0]) / B)
  const last = pts[pts.length - 1]
  // Beyond the table, continue with Craig's exponent.
  if (x >= last[0]) return Math.exp(last[1] - (x - last[0]) / B)
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      return Math.exp(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0))
    }
  }
  return Math.exp(last[1])
}

/** Fresh-yeast % (of the stage's flour) that ripens the stage in `eqH` hours at 21 °C. */
export function yeastForEqHours(curve: CurveId, eqH: number, mult = 1): number {
  if (!(eqH > 0)) return Infinity
  if (!Number.isFinite(eqH)) return 0
  if (curve === 'poolish') return poolishYeast(eqH) * mult
  return Math.pow(H1_REF / eqH, 1 / B) * mult
}

/** Inverse: equivalent hours (21 °C) for a fresh-yeast % to ripen the stage. */
export function eqHoursForYeast(curve: CurveId, yFreshPct: number, mult = 1): number {
  if (!(yFreshPct > 0)) return Infinity
  if (curve === 'poolish') {
    let lo = 0.05
    let hi = 5000
    for (let i = 0; i < 80; i++) {
      const mid = Math.sqrt(lo * hi)
      if (poolishYeast(mid) * mult > yFreshPct) lo = mid
      else hi = mid
    }
    return Math.sqrt(lo * hi)
  }
  return H1_REF * Math.pow(yFreshPct / mult, -B)
}

/* ------------------------------------------------------------------ */
/* Biga (MasterBiga law)                                               */
/* ------------------------------------------------------------------ */

const BIGA_REF_C = 18
const BIGA_COLD_C = 12

/** Biga ripening speed relative to 18 °C: ∝ T above 12 °C (MasterBiga), Craig's curve below. */
export function bigaRateAt(tC: number): number {
  if (tC >= BIGA_COLD_C) return Math.min(tC, 35) / BIGA_REF_C
  return (BIGA_COLD_C / BIGA_REF_C) * (rateAt(tC) / rateAt(BIGA_COLD_C))
}

/** Hours at 18 °C for a biga of this hydration with 1 % fresh yeast (MasterBiga: K(H)/T). */
export function bigaRefHours(hydration: number): number {
  const H = Math.min(60, Math.max(40, hydration))
  return (370 - 5.81 * (H - 40)) / BIGA_REF_C
}

/** Fresh-yeast % for a biga that accumulates `eq18` equivalent hours at 18 °C. */
export function bigaYeastFor(eq18: number, hydration: number, saltPct = 0): number {
  if (!(eq18 > 0)) return Infinity
  return Math.pow(bigaRefHours(hydration) / eq18, 1 / B) * saltMultiplier(saltPct, hydration)
}

/** Equivalent hours at 18 °C for a biga with this fresh-yeast % to ripen. */
export function bigaHoursFor(yFreshPct: number, hydration: number, saltPct = 0): number {
  if (!(yFreshPct > 0)) return Infinity
  return bigaRefHours(hydration) * Math.pow(yFreshPct / saltMultiplier(saltPct, hydration), -B)
}

/* ------------------------------------------------------------------ */
/* Sourdough (Craig's sourdough chart)                                 */
/* ------------------------------------------------------------------ */

/** Doubling time (h) of the inoculation needed, Craig's sourdough polynomial (°F inside). */
export function sdDoublingHours(tC: number): number {
  const F = Math.min(100, Math.max(32, (tC * 9) / 5 + 32))
  const P1 = -0.0000336713 * F ** 4 + 0.0105207916 * F ** 3 - 1.2495985607 * F ** 2 + 67.0024722564 * F - 1374.6540546564
  const D = -Math.LN2 * P1
  if (tC < 0) return D * Math.pow(1.3, -tC) // practically dormant below freezing
  return Math.max(2.5, D)
}

const SD_MAX = 89.4
/** Salt-free levain builds ferment ~1.6× faster than a salted dough. */
const BUILD_SPEED = 1.6
/** Build doublings for a 1 : 1 : 1 feed to reach its peak. */
const BUILD_BASE = 1.95

/** Ripe starter % of total flour that readies a dough after `doublings` (Σ t/D). */
export function starterForDoublings(doublings: number): number {
  return Math.min(60, Math.max(0.5, SD_MAX * Math.pow(2, -doublings)))
}

export function doublingsForStarter(starterPct: number): number {
  return Math.max(0.05, Math.log2(SD_MAX / Math.max(0.1, starterPct)))
}

/** Seed ratio (ripe starter : fresh flour; 1 = 1 : 1 : 1) that peaks after `doublings` (Σ t/D). */
export function seedForDoublings(doublings: number): number {
  const s = Math.pow(2, BUILD_BASE - BUILD_SPEED * doublings)
  return Math.min(2, Math.max(0.02, s))
}

export function doublingsForSeed(seed: number): number {
  return (BUILD_BASE + Math.log2(1 / Math.max(0.005, seed))) / BUILD_SPEED
}

/* ------------------------------------------------------------------ */
/* Simulation over a schedule                                          */
/* ------------------------------------------------------------------ */

export type SimSegment = ThermalSegment

export interface SegmentProgress {
  /** Yeast: equivalent hours at 21 °C. */
  eqHours: number
  /** Sourdough: Σ t / D(T). */
  sdDoublings: number
  /** Biga: equivalent hours at 18 °C. */
  bigaEq18: number
  meanC: number
  endC: number
}

export interface SimResult extends Omit<SegmentProgress, 'meanC' | 'endC'> {
  segments: SegmentProgress[]
  endC: number
  /** Dough temperature curve (hours from start). */
  curve: { t: number; doughC: number; envC: number }[]
}

/** Integrates every fermentation clock over the simulated dough temperature (Newton cooling). */
export function simulate(segments: SimSegment[], startC: number): SimResult {
  let T = startC
  let t = 0
  const segs: SegmentProgress[] = []
  const curve: SimResult['curve'] = [{ t: 0, doughC: startC, envC: segments[0]?.envC ?? startC }]
  for (const seg of segments) {
    const p: SegmentProgress = { eqHours: 0, sdDoublings: 0, bigaEq18: 0, meanC: T, endC: T }
    if (seg.hours > 0) {
      const tau = tauHours(seg.pieceMassG)
      const n = Math.max(1, Math.ceil(seg.hours / 0.1))
      const dt = seg.hours / n
      const decay = Math.exp(-dt / tau)
      let sumMean = 0
      for (let k = 0; k < n; k++) {
        const next = seg.envC + (T - seg.envC) * decay
        // Exact mean of the exponential over the slice.
        const mean = seg.envC + ((T - seg.envC) * tau * (1 - decay)) / dt
        p.eqHours += dt * rateAt(mean)
        p.sdDoublings += dt / sdDoublingHours(mean)
        p.bigaEq18 += dt * bigaRateAt(mean)
        sumMean += mean * dt
        T = next
        t += dt
        if (k === n - 1 || t - curve[curve.length - 1].t >= 0.25) curve.push({ t, doughC: T, envC: seg.envC })
      }
      p.meanC = sumMean / seg.hours
    }
    p.endC = T
    segs.push(p)
  }
  return {
    eqHours: segs.reduce((s, x) => s + x.eqHours, 0),
    sdDoublings: segs.reduce((s, x) => s + x.sdDoublings, 0),
    bigaEq18: segs.reduce((s, x) => s + x.bigaEq18, 0),
    segments: segs,
    endC: T,
    curve,
  }
}

/** Equivalent 21 °C hours for constant-temperature phases (no thermal lag). */
export function eqHoursConstant(phases: { tempC: number; hours: number }[]): number {
  return phases.reduce((s, p) => s + p.hours * rateAt(p.tempC), 0)
}
