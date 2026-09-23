/**
 * Published targets, run through the whole pipeline (composition → water → thermal simulation →
 * leavening). Each case is a formula or rule from practice or the literature; the model must land on it.
 */
import { describe, expect, it } from 'vitest'
import { computeRecipe } from './compute'
import { makePhase } from './phases'
import { hoursToReach } from './thermal'
import { C_FLOUR, C_SALT, C_WATER, doughTempFor, Q_HYDRATION } from './temperature'
import { pressureRatio } from './altitude'
import { teaspoons } from './measures'
import { yeastFromFresh } from './yeastTypes'
import { BAKE_WINDOW, doublingsForSeed, sdDoublingHours } from './fermentation'
import { piecesFor, toppingsPerPizza, DEFAULT_PARTY } from './party'
import type { Recipe } from './types'
import { makePreferment, recipeFromStyle } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

const fToC = (f: number) => ((f - 32) * 5) / 9
const fresh = { ...DEFAULT_SETTINGS, yeastType: 'fresh' as const }

/** A direct dough held at one temperature from the end of mixing (no thermal lag, no mixing time). */
function constantDough(style: string, tempC: number, hours: number[], patch: Partial<Recipe> = {}): Recipe {
  const r = recipeFromStyle(style, { ...fresh, roomC: tempC })
  r.kitchen = { ...r.kitchen, roomC: tempC, flourC: tempC, targetFdtC: tempC }
  r.final.mixMinutes = 0
  r.final.phases = hours.map((h, i) => makePhase('room', h, i === 0 ? 'bulk' : 'balls'))
  return { ...r, ...patch }
}
const final = (r: Recipe) => computeRecipe(r).stages.find((s) => s.id === 'final')!

/** A preferment held at one temperature. */
function withPreferment(type: 'biga' | 'poolish' | 'licoli', pct: number, tempC: number, hours: number, patch: Partial<ReturnType<typeof makePreferment>> = {}) {
  const r = recipeFromStyle('canotto', { ...fresh, roomC: tempC })
  r.method = 'indirect'
  const p = { ...makePreferment(type, pct), targetTempC: tempC, honeyPct: 0, ...patch }
  p.phases = [makePhase('custom', hours, undefined, tempC)]
  r.preferments = [p]
  r.kitchen = { ...r.kitchen, roomC: tempC, flourC: tempC }
  return r
}

describe("Craig's chart through the whole pipeline", () => {
  // Reference dough (63 % water, 2.8 % salt) at a constant temperature: fresh-yeast % to double.
  const cases: [number, number, number][] = [
    [70, 12, 0.175],
    [70, 8, 0.3],
    [60, 24, 0.2],
    [75, 5, 0.3],
    [65, 16, 0.175],
  ]
  for (const [f, hours, table] of cases)
    it(`${hours} h at ${f} °F → ${table} % fresh yeast`, () => {
      const y = final(constantDough('neapolitan', fToC(f), [hours], { hydration: 63, saltPct: 2.8 })).leavening.freshPct
      expect(Math.abs(Math.log(y / table))).toBeLessThan(0.2)
    })
})

describe('AVPN / STG Neapolitan formula lands in the bake window', () => {
  // STG: per litre of water 1.7–1.8 kg flour, 40–60 g salt, up to 3 g fresh yeast; 2 h bulk, 4–6 h balls.
  const stg = (tempC: number, hours: number[], gPerL: number) => {
    const r = constantDough('neapolitan', tempC, hours, { hydration: 57, saltPct: 2.8 })
    r.final.extraYeastMode = 'manual'
    r.final.extraYeastPct = (gPerL * 0.57) / 10
    return final(r).ripeness
  }
  it('3 g/L, 2 h + 6 h at 25 °C', () => {
    const rp = stg(25, [2, 6], 3)
    expect(rp).toBeGreaterThan(BAKE_WINDOW.min)
    expect(rp).toBeLessThan(BAKE_WINDOW.max)
  })
  it('3 g/L, 2 h + 4 h at 25 °C (the fast end) is just ready', () => {
    const rp = stg(25, [2, 4], 3)
    expect(rp).toBeGreaterThan(0.75)
    expect(rp).toBeLessThan(1.1)
  })
  it('the model’s own 24 h Neapolitan uses about 1 g/L, as pizzerie do', () => {
    const r = constantDough('neapolitan', 21, [2, 22], { hydration: 60 })
    const gPerL = (final(r).leavening.freshPct * (1000 / 0.6)) / 100
    expect(gPerL).toBeGreaterThan(0.6)
    expect(gPerL).toBeLessThan(1.8)
  })
  it('the model’s AVPN salt is 40–60 g/L', () => {
    const r = recipeFromStyle('neapolitan', fresh)
    const gPerL = (r.saltPct / r.hydration) * 1000
    expect(gPerL).toBeGreaterThanOrEqual(40)
    expect(gPerL).toBeLessThanOrEqual(60)
  })
})

describe('Biga (Giorilli, MasterBiga)', () => {
  it('18 h at 18 °C, 45 % water → about 1 % fresh yeast', () => {
    const r = withPreferment('biga', 100, 18, 18, { hydration: 45 })
    const b = computeRecipe(r).stages[0]
    expect(b.leavening.freshPct).toBeGreaterThan(0.9)
    expect(b.leavening.freshPct).toBeLessThan(1.2)
    expect(b.mixTempC).toBeCloseTo(18, 1)
  })
  it('1 % fresh yeast is ready anywhere in the classic 16–24 h at 18 °C', () => {
    for (const h of [16, 18, 20, 24]) {
      const r = withPreferment('biga', 100, 18, h, { hydration: 45, amountMode: 'manual', manualPct: 1 })
      const rp = computeRecipe(r).stages[0].ripeness
      expect(rp, `${h} h`).toBeGreaterThan(0.8)
      expect(rp, `${h} h`).toBeLessThan(1.35)
    }
  })
  it('a 100 % biga dough is ready ~3 h after closing at 22 °C; 50 % biga takes longer', () => {
    const readyAfter = (pct: number) => {
      const r = withPreferment('biga', pct, 18, 18, { hydration: 45 })
      r.kitchen = { ...r.kitchen, roomC: 22, flourC: 22 }
      r.final.extraYeastMode = 'none'
      r.final.mixMinutes = 15
      for (let h = 0.5; h <= 12; h += 0.25) {
        r.final.phases = [makePhase('room', h, 'bulk')]
        if (computeRecipe(r).stages.at(-1)!.ripeness >= 1) return h
      }
      return Infinity
    }
    const full = readyAfter(100)
    const half = readyAfter(50)
    expect(full).toBeGreaterThanOrEqual(2)
    expect(full).toBeLessThanOrEqual(4)
    expect(half).toBeGreaterThan(full)
    expect(half).toBeLessThanOrEqual(6)
  })
})

describe('Poolish (Italian table at 21 °C)', () => {
  for (const [h, pct] of [
    [16, 0.1],
    [12, 0.175],
    [8, 0.49],
    [3, 1.5],
  ] as const)
    it(`${h} h → ${pct} % fresh yeast`, () => {
      const p = computeRecipe(withPreferment('poolish', 30, 21, h)).stages[0]
      expect(p.leavening.freshPct).toBeCloseTo(pct, 2)
    })
})

describe('Sourdough', () => {
  it("Craig's sourdough chart: 16 h at 70 °F → ~10 % starter", () => {
    const r = constantDough('neapolitan', fToC(70), [16])
    r.directLeavening = 'sourdough'
    expect(final(r).leavening.starterPct).toBeCloseTo(10.1, 0)
  })
  it('stays in the range pizza bakers use (starters vary 2–3× in strength)', () => {
    const starter = (tempC: number, hours: number) => {
      const r = constantDough('neapolitan', tempC, [hours])
      r.directLeavening = 'sourdough'
      return final(r).leavening.starterPct
    }
    // Rules of thumb: 1–3 % for 24–48 h at 18–20 °C, 5–10 % for 12–18 h, 15–25 % for 5–8 h at ~24 °C.
    expect(starter(19, 30)).toBeGreaterThan(1)
    expect(starter(19, 30)).toBeLessThan(5)
    expect(starter(21, 15)).toBeGreaterThan(5)
    expect(starter(21, 15)).toBeLessThan(14)
    expect(starter(24, 6.5)).toBeGreaterThan(15)
    expect(starter(24, 6.5)).toBeLessThan(32)
  })
  it('a licoli fed 1 : 1 : 1 peaks in 4–6 h at 24 °C', () => {
    const peak = doublingsForSeed(1) * sdDoublingHours(24)
    expect(peak).toBeGreaterThan(4)
    expect(peak).toBeLessThan(6)
    const l = computeRecipe(withPreferment('licoli', 20, 24, 5)).stages[0]
    // Seed as % of the fresh flour: 100 % = 1 : 1 : 1.
    expect(l.leavening.starterPct).toBeGreaterThan(70)
    expect(l.leavening.starterPct).toBeLessThan(130)
  })
})

describe('Dough temperature (heat balance)', () => {
  const masses = (flourC: number) => [
    { label: 'flour', massG: 1000, cp: C_FLOUR, tempC: flourC },
    { label: 'salt', massG: 28, cp: C_SALT, tempC: flourC },
  ]
  it('wetting flour warms a 65 % dough by about 3.3 °C (15.1 kJ/kg of flour)', () => {
    const t = doughTempFor({ masses: masses(20), waterG: 650, newFlourG: 1000, mixerRiseC: 0 }, 20)
    expect(t - 20).toBeCloseTo((1000 * Q_HYDRATION) / (1000 * C_FLOUR + 28 * C_SALT + 650 * C_WATER), 6)
    expect(t - 20).toBeGreaterThan(3)
    expect(t - 20).toBeLessThan(3.6)
  })
  it('water carries ~60 % of the heat: 1 °C of dough takes ~1.7 °C of water', () => {
    const at = (w: number) => doughTempFor({ masses: masses(20), waterG: 650, newFlourG: 1000, mixerRiseC: 0 }, w)
    const slope = (at(30) - at(10)) / 20
    expect(slope).toBeGreaterThan(0.55)
    expect(slope).toBeLessThan(0.65)
  })
})

describe('Fridge cooling', () => {
  it('a 250 g ball: 24 → 8 °C in a 4 °C fridge in ~3 h', () => {
    const h = hoursToReach(24, 8, 4, 250)
    expect(h).toBeGreaterThan(2.5)
    expect(h).toBeLessThan(3.5)
  })
  it('a 2 kg tub stays above 10 °C for 4–6 h', () => {
    const h = hoursToReach(24, 10, 4, 2000)
    expect(h).toBeGreaterThan(4)
    expect(h).toBeLessThan(6)
  })
})

describe('Units and measures', () => {
  it('yeast types: fresh = 3 × instant = 2.5 × active dry (Craig: IDY 0.32, ADY 0.42 of fresh)', () => {
    expect(yeastFromFresh(1, 'instant')).toBeCloseTo(0.333, 2)
    expect(yeastFromFresh(1, 'active-dry')).toBeCloseTo(0.4, 2)
    expect(Math.abs(yeastFromFresh(1, 'instant') - 0.32)).toBeLessThan(0.02)
    expect(Math.abs(yeastFromFresh(1, 'active-dry') - 0.42)).toBeLessThan(0.03)
  })
  it('a 7 g packet of instant yeast is 2¼ tsp; 6 g of fine salt is 1 tsp', () => {
    expect(teaspoons('yeast', 7, 'instant')).toBe('≈ 2¼ tsp')
    expect(teaspoons('salt', 6)).toBe('≈ 1 tsp')
  })
  it('altitude: standard-atmosphere pressure', () => {
    // 3,000 / 5,000 / 7,000 / 10,000 ft → 90.8 / 84.3 / 78.2 / 69.7 kPa of 101.325.
    expect(pressureRatio(914)).toBeCloseTo(90.8 / 101.325, 2)
    expect(pressureRatio(1524)).toBeCloseTo(84.3 / 101.325, 2)
    expect(pressureRatio(2134)).toBeCloseTo(78.2 / 101.325, 2)
    expect(pressureRatio(3048)).toBeCloseTo(69.7 / 101.325, 2)
  })
})

describe('Toppings and portions', () => {
  it('AVPN: 60–80 g tomato and 80–100 g fior di latte on a 250 g Neapolitan', () => {
    const t = toppingsPerPizza(recipeFromStyle('neapolitan', fresh), 250)
    const g = (k: string) => t.find((x) => x.key === k)!.grams
    expect(g('sauce')).toBeGreaterThanOrEqual(60)
    expect(g('sauce')).toBeLessThanOrEqual(80)
    expect(g('cheese')).toBeGreaterThanOrEqual(80)
    expect(g('cheese')).toBeLessThanOrEqual(100)
  })
  it('a 14″ NY pie carries a pizzeria medium load (Burke: ~163 g sauce, ~198 g cheese)', () => {
    const area = Math.PI * (35.56 / 2) ** 2
    const ball = area * 0.395
    const t = toppingsPerPizza(recipeFromStyle('ny', fresh), ball)
    const g = (k: string) => t.find((x) => x.key === k)!.grams
    expect(Math.abs(g('sauce') / 163 - 1)).toBeLessThan(0.15)
    expect(Math.abs(g('cheese') / 198 - 1)).toBeLessThan(0.15)
  })
  it('a 10×14″ Detroit pan takes ~340 g of brick cheese', () => {
    const r = recipeFromStyle('detroit', fresh)
    const t = toppingsPerPizza(r, 500)
    expect(Math.abs(t.find((x) => x.key === 'cheese')!.grams / 340 - 1)).toBeLessThan(0.1)
  })
  it('one Neapolitan per adult; an 18″ NY pie feeds about three', () => {
    expect(piecesFor(recipeFromStyle('neapolitan', fresh), 250, { ...DEFAULT_PARTY, adults: 8, spare: false })).toBe(8)
    expect(piecesFor(recipeFromStyle('ny', fresh), 560, { ...DEFAULT_PARTY, adults: 6, spare: false })).toBe(2)
    expect(piecesFor(recipeFromStyle('ny', fresh), 560, { ...DEFAULT_PARTY, adults: 12, spare: false })).toBe(5)
  })
})
