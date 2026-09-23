import { describe, expect, it } from 'vitest'
import { CRAIG_HOURS, CY_PCT } from './craigTable'
import {
  bigaHoursFor,
  bigaRateAt,
  bigaYeastFor,
  craigHours,
  doublingsForSeed,
  doublingsForStarter,
  doughMultiplier,
  eqHoursForYeast,
  rateAt,
  sdDoublingHours,
  seedForDoublings,
  simulate,
  starterForDoublings,
  yeastForEqHours,
} from './fermentation'

const fToC = (f: number) => ((f - 32) * 5) / 9

describe('Craig table fit', () => {
  it('reproduces the published table within ~15 % for well-resolved cells', () => {
    let n = 0
    let sumSq = 0
    for (const [tf, hours] of CRAIG_HOURS) {
      hours.forEach((h, j) => {
        if (h === null || h < 6) return
        const model = craigHours(CY_PCT[j], fToC(tf))
        const err = Math.log(model / h)
        sumSq += err * err
        n++
        expect(Math.abs(err)).toBeLessThan(0.3)
      })
    }
    expect(Math.sqrt(sumSq / n)).toBeLessThan(0.08)
  })

  it('makes 21 °C the reference speed and slows ~12× in a 4 °C fridge', () => {
    expect(rateAt(21)).toBeCloseTo(1)
    expect(rateAt(4)).toBeGreaterThan(0.06)
    expect(rateAt(4)).toBeLessThan(0.1)
    expect(rateAt(27) / rateAt(21)).toBeGreaterThan(2)
    // Monotone between 0 and 35 °C, then falls off.
    for (let t = -2; t < 35; t += 0.5) expect(rateAt(t + 0.5)).toBeGreaterThan(rateAt(t))
    expect(rateAt(42)).toBeLessThan(rateAt(35))
  })
})

describe('yeast amounts vs practice', () => {
  const neapolitan = doughMultiplier({ hydration: 60, saltPct: 2.8, oilPct: 0, sugarPct: 0 })

  it('AVPN same-day dough: 2 h + 6 h at 25 °C needs ~0.1–0.25 % fresh yeast (3 g/L STG ≈ 0.17 %)', () => {
    const eq = 8 * rateAt(25)
    const y = yeastForEqHours('dough', eq, neapolitan)
    expect(y).toBeGreaterThan(0.08)
    expect(y).toBeLessThan(0.25)
  })

  it('24 h at 20 °C Neapolitan needs a tiny dose (0.05–0.12 % fresh)', () => {
    const y = yeastForEqHours('dough', 24 * rateAt(20), neapolitan)
    expect(y).toBeGreaterThan(0.04)
    expect(y).toBeLessThan(0.12)
  })

  it('Giorilli / MasterBiga biga: 1 % fresh yeast ≈ 19 h at 18 °C, K(H)/T hours', () => {
    const eq18 = (hours: number, t: number) => hours * bigaRateAt(t)
    expect(bigaYeastFor(eq18(18.9, 18), 45)).toBeCloseTo(1, 2)
    // MasterBiga: 45 % biga at 20 °C → ~17 h; 60 % biga ferments faster than 40 %.
    expect(bigaHoursFor(1, 45) / bigaRateAt(20)).toBeCloseTo(17, 0)
    expect(bigaHoursFor(1, 60)).toBeLessThan(bigaHoursFor(1, 40))
    // Longer biga → less yeast (24 h at 18 °C ≈ 0.7 %).
    const y24 = bigaYeastFor(eq18(24, 18), 45)
    expect(y24).toBeGreaterThan(0.6)
    expect(y24).toBeLessThan(0.8)
    // In the fridge a biga barely moves.
    expect(bigaRateAt(4)).toBeLessThan(0.25)
  })

  it('poolish follows the Juju / Calvel table at 21 °C', () => {
    const at = (h: number) => yeastForEqHours('poolish', h, 1)
    expect(at(2)).toBeCloseTo(2.5, 5)
    expect(at(8)).toBeCloseTo(0.49, 5)
    expect(at(16)).toBeCloseTo(0.1, 5)
    expect(at(12)).toBeCloseTo(0.175, 5)
    expect(eqHoursForYeast('poolish', at(9), 1)).toBeCloseTo(9, 3)
    // Beyond the table it keeps falling smoothly.
    expect(at(24)).toBeLessThan(0.1)
  })

  it('more salt and fat need more yeast; wetter dough needs less (up to ~69 %)', () => {
    const base = doughMultiplier({ hydration: 63, saltPct: 2.8, oilPct: 0, sugarPct: 0 })
    expect(base).toBeCloseTo(1)
    expect(doughMultiplier({ hydration: 63, saltPct: 3.2, oilPct: 0, sugarPct: 0 })).toBeGreaterThan(1)
    expect(doughMultiplier({ hydration: 63, saltPct: 2.8, oilPct: 3, sugarPct: 0 })).toBeGreaterThan(1)
    expect(doughMultiplier({ hydration: 68, saltPct: 2.8, oilPct: 0, sugarPct: 0 })).toBeLessThan(1)
  })
})

describe('sourdough (Craig chart)', () => {
  it('reproduces the chart: 16 h at 70 °F → ~10 % starter; 24 h at 65 °F → ~9.7 %', () => {
    const d70 = sdDoublingHours(fToC(70))
    expect(starterForDoublings(16 / d70)).toBeCloseTo(10.1, 0)
    expect(starterForDoublings(24 / sdDoublingHours(fToC(65)))).toBeCloseTo(9.75, 0)
    // Optimum near 28 °C, slower when hotter.
    expect(sdDoublingHours(28)).toBeLessThan(sdDoublingHours(21))
    expect(sdDoublingHours(35)).toBeGreaterThan(sdDoublingHours(28))
  })

  it('1 : 1 : 1 feed peaks in ~4–5 h at 24 °C and ~6 h at 21 °C; dilute feeds take longer', () => {
    const peak = (seed: number, t: number) => doublingsForSeed(seed) * sdDoublingHours(t)
    expect(peak(1, 24)).toBeGreaterThan(3.8)
    expect(peak(1, 24)).toBeLessThan(5.2)
    expect(peak(1, 21)).toBeGreaterThan(5)
    expect(peak(1, 21)).toBeLessThan(7)
    expect(peak(0.2, 21)).toBeGreaterThan(peak(1, 21) + 5)
    expect(seedForDoublings(doublingsForSeed(0.3))).toBeCloseTo(0.3, 6)
  })

  it('starter percentage and doublings are inverse functions', () => {
    for (const pct of [2, 5, 10, 20, 40]) expect(starterForDoublings(doublingsForStarter(pct))).toBeCloseTo(pct, 6)
  })
})

describe('thermal-lag simulation', () => {
  it('accumulates more fermentation in the fridge than an instant-chill assumption', () => {
    const sim = simulate([{ envC: 4, hours: 24, pieceMassG: 250 }], 24)
    const instant = 24 * rateAt(4)
    expect(sim.eqHours).toBeGreaterThan(instant * 1.2)
    expect(sim.endC).toBeLessThan(4.5)
    expect(sim.segments[0].meanC).toBeGreaterThan(4)
  })

  it('a big bulk tub ferments more than balls in the same fridge time', () => {
    const bulk = simulate([{ envC: 4, hours: 24, pieceMassG: 2000 }], 24)
    const balls = simulate([{ envC: 4, hours: 24, pieceMassG: 250 }], 24)
    expect(bulk.eqHours).toBeGreaterThan(balls.eqHours)
  })
})
