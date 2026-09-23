import { describe, expect, it } from 'vitest'
import { computeRecipe } from './compute'
import { makePhase } from './phases'
import { applyRiseReading, markMixed, phaseSpans, replan, riseForRipeness, ripenessAt, ripenessForRise } from './replan'
import { recipeFromStyle } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

const H = 3600000
const bakeMs = new Date(2026, 5, 6, 19, 0).getTime()

function plan() {
  const r = recipeFromStyle('neapolitan', { ...DEFAULT_SETTINGS, roomC: 21, fridgeC: 4, yeastType: 'fresh' })
  r.final.phases = [makePhase('room', 2, 'bulk'), makePhase('fridge', 20, 'balls'), makePhase('room', 3, 'balls')]
  r.bakeAt = new Date(bakeMs).toISOString()
  return r
}
const opts = { tempUnit: 'C' as const }
const run = (r: ReturnType<typeof plan>) => computeRecipe(r, { ...opts, bakeAtMs: Date.parse(r.bakeAt!) })
const final = (r: ReturnType<typeof plan>) => run(r).stages.find((s) => s.id === 'final')!

describe('live tracking', () => {
  it('locks the yeast when the dough is mixed and absorbs a late start in the first phase', () => {
    const r = plan()
    const res = run(r)
    const f = res.stages.find((s) => s.id === 'final')!
    const plannedMixed = bakeMs + (f.startH + r.final.mixMinutes / 60) * H
    const late = markMixed(r, res, 'final', plannedMixed + 0.5 * H, null, bakeMs)
    expect(late.final.extraYeastMode).toBe('manual')
    expect(late.final.extraYeastPct).toBeCloseTo(f.leavening.typePct, 9)
    expect(late.final.phases[0].hours).toBeCloseTo(1.5, 9)
    expect(late.final.phases[1].hours).toBe(20)
    // Half an hour less fermentation with the same yeast: a little under-ripe at the bake.
    const lf = final(late)
    expect(lf.ripeness).toBeLessThan(1)
    expect(lf.ripeness).toBeGreaterThan(0.9)
    // Later steps keep their clock times.
    const spansBefore = phaseSpans(r)
    const spansAfter = phaseSpans(late)
    expect(spansAfter[1].startH).toBeCloseTo(spansBefore[1].startH, 9)
  })

  it('uses the measured dough temperature and offers ways to get back on time', () => {
    const r = plan()
    const res = run(r)
    const f = res.stages.find((s) => s.id === 'final')!
    const mixedAt = bakeMs + (f.startH + r.final.mixMinutes / 60) * H
    const warm = markMixed(r, res, 'final', mixedAt, f.mixTempC + 2, bakeMs)
    expect(final(warm).ripeness).toBeGreaterThan(1.04)
    // An hour into the bulk: the dough is warm, so it should go into the fridge sooner.
    const now = mixedAt + 1 * H
    const plan2 = replan(warm, opts, now)!
    expect(plan2.stageId).toBe('final')
    const shift = plan2.options.find((o) => o.id === 'shift')
    expect(shift).toBeDefined()
    expect(Math.abs(shift!.ripeness - 1)).toBeLessThan(0.03)
    expect(shift!.shiftH!).toBeLessThan(0)
    expect(shift!.nextStepAtMs!).toBeLessThan(mixedAt + 2 * H)
    const hold = plan2.options.find((o) => o.id === 'hold')
    expect(hold).toBeDefined()
    expect(Math.abs(hold!.ripeness - 1)).toBeLessThan(0.03)
    // Nothing before now moved.
    expect(phaseSpans(shift!.recipe)[0].startH).toBeCloseTo(phaseSpans(warm)[0].startH, 9)
  })

  it('offers the closest option when a very warm dough cannot be fully rescued', () => {
    const r = plan()
    const res = run(r)
    const f = res.stages.find((s) => s.id === 'final')!
    const mixedAt = bakeMs + (f.startH + r.final.mixMinutes / 60) * H
    const hot = markMixed(r, res, 'final', mixedAt, f.mixTempC + 4, bakeMs)
    const plan2 = replan(hot, opts, mixedAt + 4 * H)!
    const keep = plan2.options.find((o) => o.id === 'keep')!
    const shift = plan2.options.find((o) => o.id === 'shift')
    expect(shift).toBeDefined()
    expect(Math.abs(shift!.ripeness - 1)).toBeLessThan(Math.abs(keep.ripeness - 1))
    // No "bake now, straight from the fridge" suggestions.
    const early = plan2.options.find((o) => o.id === 'bake-when-ready')
    if (early) expect(early.bakeAtMs!).toBeGreaterThan(bakeMs - 3 * H)
  })

  it('re-plans for a later bake without moving the past', () => {
    const r = plan()
    const res = run(r)
    const f = res.stages.find((s) => s.id === 'final')!
    const mixedAt = bakeMs + (f.startH + r.final.mixMinutes / 60) * H
    const mixed = markMixed(r, res, 'final', mixedAt, null, bakeMs)
    const now = mixedAt + 6 * H
    const later = replan(mixed, opts, now, bakeMs + 3 * H)!
    const keep = later.options.find((o) => o.id === 'keep')!
    // Three extra hours at room temperature over-proof it...
    expect(keep.ripeness).toBeGreaterThan(1.1)
    expect(Date.parse(keep.recipe.bakeAt!)).toBe(bakeMs + 3 * H)
    // ...while holding it cooler (or moving the next step) lands on time.
    const fix = later.options.find((o) => (o.id === 'shift' || o.id === 'hold') && Math.abs(o.ripeness - 1) < 0.03)!
    expect(fix).toBeDefined()
    const s0 = phaseSpans(mixed)[0]
    const s1 = phaseSpans(fix.recipe)[0]
    // Absolute start of the dough is unchanged.
    expect(bakeMs + s0.startH * H).toBeCloseTo(Date.parse(fix.recipe.bakeAt!) + s1.startH * H, -3)
  })

  it('offers nothing new when the dough is on time', () => {
    const r = plan()
    const res = run(r)
    const f = res.stages.find((s) => s.id === 'final')!
    const mixedAt = bakeMs + (f.startH + r.final.mixMinutes / 60) * H
    const mixed = markMixed(r, res, 'final', mixedAt, null, bakeMs)
    const same = replan(mixed, opts, mixedAt + 6 * H)!
    expect(same.options.map((o) => o.id)).toEqual(['keep'])
  })

  it('reads a sample jar as a speed factor', () => {
    expect(riseForRipeness(1, 1)).toBeCloseTo(100, 6)
    expect(ripenessForRise(100, 1)).toBeCloseTo(1, 6)
    const r = plan()
    const res = run(r)
    const f = res.stages.find((s) => s.id === 'final')!
    const mixedAt = bakeMs + (f.startH + r.final.mixMinutes / 60) * H
    const mixed = markMixed(r, res, 'final', mixedAt, null, bakeMs)
    const mres = run(mixed)
    const at = bakeMs - 2 * H
    const expected = riseForRipeness(ripenessAt(mres.stages.find((s) => s.id === 'final')!, -2), mixed.final.proofTarget)
    // The jar shows 30 % more rise than expected: the dough is faster than the model.
    const read = applyRiseReading(mixed, mres, expected * 1.3, at, bakeMs)
    expect(read.activity).toBeGreaterThan(1)
    expect(read.reliable).toBe(true)
    expect(final(read.recipe).ripeness).toBeGreaterThan(1)
    // A reading minutes after mixing is ignored.
    const early = applyRiseReading(mixed, mres, 20, mixedAt + 0.2 * H, bakeMs)
    expect(early.ignored).toBe(true)
    expect(early.activity).toBe(1)
  })
})
