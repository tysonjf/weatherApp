import { describe, expect, it } from 'vitest'
import { computeRecipe } from './compute'
import { makePhase } from './phases'
import type { Recipe } from './types'
import { makePreferment, recipeFromStyle } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

const settings = { ...DEFAULT_SETTINGS, roomC: 21, fridgeC: 4, tapC: 12, mixerId: 'hand', yeastType: 'fresh' as const }

function neapolitan(): Recipe {
  const r = recipeFromStyle('neapolitan', settings)
  r.sizing = { ...r.sizing, count: 6, ballWeight: 250 }
  r.wastePct = 0
  return r
}

const stage = (res: ReturnType<typeof computeRecipe>, id: string) => res.stages.find((s) => s.id === id)!
const line = (res: ReturnType<typeof computeRecipe>, id: string, key: string) =>
  stage(res, id).ingredients.find((l) => l.key === key)

describe('direct Neapolitan', () => {
  it('computes flour/water/salt from ball weights and a tiny 24 h yeast dose', () => {
    const r = neapolitan()
    const res = computeRecipe(r)
    // 1500 g dough / (1 + 0.60 + 0.028 + yeast) ≈ 921 g flour
    expect(res.totals.flour).toBeGreaterThan(915)
    expect(res.totals.flour).toBeLessThan(925)
    expect(res.totals.water).toBeCloseTo(res.totals.flour * 0.6, 3)
    expect(res.totals.dough).toBeCloseTo(1500, 3)
    const y = stage(res, 'final').leavening
    expect(y.freshPct).toBeGreaterThan(0.03)
    expect(y.freshPct).toBeLessThan(0.15)
    expect(stage(res, 'final').ripeness).toBeCloseTo(1, 3)
    // Water temperature for a 24 °C dough in a 21 °C kitchen by hand is cool-ish tap water.
    const w = stage(res, 'final').waterPlan!
    expect(w.waterC).toBeGreaterThan(14)
    expect(w.waterC).toBeLessThan(28)
  })

  it('scales yeast down for colder rooms and up for hot ones', () => {
    const cold = neapolitan()
    cold.kitchen.roomC = 18
    const hot = neapolitan()
    hot.kitchen.roomC = 26
    const yc = stage(computeRecipe(cold), 'final').leavening.freshPct
    const yh = stage(computeRecipe(hot), 'final').leavening.freshPct
    expect(yc).toBeGreaterThan(yh * 3)
  })

  it('applies the personal yeast calibration without changing the plan', () => {
    const base = computeRecipe(neapolitan())
    const slow = computeRecipe(neapolitan(), { yeastScale: 1.25 })
    expect(stage(slow, 'final').leavening.freshPct).toBeCloseTo(stage(base, 'final').leavening.freshPct * 1.25, 6)
    expect(stage(slow, 'final').ripeness).toBeCloseTo(1, 3)
    expect(slow.totalHours).toBeCloseTo(base.totalHours, 6)
  })

  it('builds a timeline that ends with the bake and starts with the mix', () => {
    const res = computeRecipe(neapolitan())
    expect(res.timeline.at(-1)!.kind).toBe('bake')
    expect(res.timeline[0].kind).toBe('mix')
    expect(res.totalHours).toBeGreaterThan(24)
    expect(res.timeline.some((e) => e.kind === 'ball')).toBe(true)
  })
})

describe('biga + poolish (research worked example)', () => {
  function recipe(): Recipe {
    const r = recipeFromStyle('canotto', settings)
    r.sizing = { ...r.sizing, count: 1, ballWeight: 1000 * (1 + 0.68 + 0.028) }
    r.wastePct = 0
    r.hydration = 68
    r.saltPct = 2.8
    r.method = 'indirect'
    const biga = makePreferment('biga', 30)
    const poolish = makePreferment('poolish', 20)
    // A fridge poolish: 1 h at room, 16 h cold.
    poolish.phases = [makePhase('room', 1), makePhase('fridge', 16)]
    r.preferments = [biga, poolish]
    r.final.phases = [makePhase('room', 1.5, 'bulk'), makePhase('room', 4.5, 'balls')]
    r.final.reservePct = 0
    return r
  }

  it('splits flour and water across stages by difference', () => {
    const res = computeRecipe(recipe())
    const [biga, poolish] = res.stages
    // Yeast is a few grams, so flour lands a little under 1000 g.
    expect(res.totals.flour).toBeGreaterThan(995)
    expect(res.totals.flour).toBeLessThan(1000.1)
    const F = res.totals.flour
    expect(biga.flour).toBeCloseTo(F * 0.3, 5)
    expect(biga.water).toBeCloseTo(F * 0.3 * 0.45, 5)
    expect(poolish.flour).toBeCloseTo(F * 0.2, 5)
    expect(poolish.water).toBeCloseTo(F * 0.2, 5)
    const finalFlour = line(res, 'final', 'flour')!.grams
    expect(finalFlour).toBeCloseTo(F * 0.5, 5)
    const finalWater = line(res, 'final', 'water')!.grams
    expect(finalWater).toBeCloseTo(F * (0.68 - 0.135 - 0.2), 3)
    // Giorilli / MasterBiga: 45 % biga, 18 h at 18 °C → ~1 % fresh yeast
    expect(biga.leavening.freshPct).toBeGreaterThan(0.9)
    expect(biga.leavening.freshPct).toBeLessThan(1.15)
    // Poolish 1 h room + 16 h fridge ends up well under the 2 h poolish dose
    expect(poolish.leavening.freshPct).toBeGreaterThan(0.2)
    expect(poolish.leavening.freshPct).toBeLessThan(2.5)
    expect(res.totals.prefermentedFlourPct).toBeCloseTo(50)
  })

  it('needs little or no extra yeast with 50 % prefermented flour and a 6 h final', () => {
    const res = computeRecipe(recipe())
    expect(stage(res, 'final').leavening.freshPct).toBeLessThan(0.15)
  })

  it('schedules both preferments to finish at the final mix', () => {
    const res = computeRecipe(recipe())
    const mix = res.timeline.find((e) => e.kind === 'mix')!
    for (const s of res.stages.filter((s) => s.kind === 'preferment')) expect(s.endH).toBeCloseTo(mix.atH, 5)
    const builds = res.timeline.filter((e) => e.kind === 'build')
    expect(builds).toHaveLength(2)
  })

  it('needs warm water when the poolish comes straight from the fridge', () => {
    const res = computeRecipe(recipe())
    const w = stage(res, 'final').waterPlan!
    expect(w.idealWaterC).toBeGreaterThan(21)
  })
})

describe('100 % biga', () => {
  it('adds no yeast and warns that a long final would over-ferment', () => {
    const r = recipeFromStyle('canotto', settings)
    r.preferments = [makePreferment('biga', 100)]
    r.hydration = 66
    r.final.phases = [makePhase('room', 0.5, 'bulk'), makePhase('room', 8, 'balls')]
    const res = computeRecipe(r)
    expect(stage(res, 'final').leavening.freshPct).toBe(0)
    expect(line(res, 'final', 'flour')).toBeUndefined()
    expect(res.advice.some((a) => a.title.includes('over-ferment'))).toBe(true)
  })

  it('warns when a cold biga cannot be warmed by the little water left', () => {
    const r = recipeFromStyle('canotto', settings)
    const biga = makePreferment('biga', 100)
    biga.phases = [makePhase('room', 1), makePhase('fridge', 24)]
    r.preferments = [biga]
    r.hydration = 60
    const res = computeRecipe(r)
    expect(stage(res, 'final').waterPlan!.status).toBe('too-hot')
    expect(stage(res, 'final').mixTempC).toBeLessThan(r.kitchen.targetFdtC)
  })
})

describe('New York cold ferment', () => {
  it('uses more yeast than a room-temperature 48 h dough and tempers long enough', () => {
    const r = recipeFromStyle('ny', settings)
    const res = computeRecipe(r)
    const y = stage(res, 'final').leavening.freshPct
    expect(y).toBeGreaterThan(0.15)
    expect(y).toBeLessThan(1.5)
    expect(res.advice.some((a) => a.title.includes('Not enough time out of the fridge'))).toBe(false)
    expect(res.timeline.some((e) => e.kind === 'temper')).toBe(true)
  })
})

describe('constraints', () => {
  it('flags preferments that need more water than the dough has', () => {
    const r = recipeFromStyle('neapolitan', settings)
    r.method = 'indirect'
    r.hydration = 60
    r.preferments = [makePreferment('poolish', 80)]
    const res = computeRecipe(r)
    const err = res.advice.find((a) => a.severity === 'error')
    expect(err?.title).toMatch(/more water/)
  })
})

describe('sourdough', () => {
  it('computes a starter percentage for a direct sourdough dough', () => {
    const r = neapolitan()
    r.directLeavening = 'sourdough'
    const res = computeRecipe(r)
    const f = stage(res, 'final')
    expect(f.leavening.kind).toBe('sourdough')
    expect(f.leavening.starterPct).toBeGreaterThan(0.4)
    expect(f.leavening.starterPct).toBeLessThan(40)
    // A same-day plan needs a lot more starter than a 24 h one.
    const quick = neapolitan()
    quick.directLeavening = 'sourdough'
    quick.final.phases = [makePhase('room', 2, 'bulk'), makePhase('room', 5, 'balls')]
    expect(stage(computeRecipe(quick), 'final').leavening.starterPct).toBeGreaterThan(f.leavening.starterPct * 5)
    // Starter flour and water are part of the totals.
    expect(res.totals.water / res.totals.flour).toBeCloseTo(0.6, 5)
    expect(res.timeline.some((e) => e.kind === 'feed')).toBe(true)
  })

  it('builds a licoli levain with a feeding ratio', () => {
    const r = recipeFromStyle('neapolitan', settings)
    r.method = 'indirect'
    r.preferments = [makePreferment('licoli', 15)]
    const res = computeRecipe(r)
    const lev = res.stages[0]
    expect(lev.leavening.kind).toBe('sourdough')
    expect(lev.ingredients.find((l) => l.kind === 'starter')!.grams).toBeGreaterThan(0)
    expect(lev.flour).toBeCloseTo(res.totals.flour * 0.15, 5)
  })
})
