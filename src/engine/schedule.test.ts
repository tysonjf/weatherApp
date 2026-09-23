import { describe, expect, it } from 'vitest'
import { computeRecipe } from './compute'
import { makePhase } from './phases'
import { blocks, clashes, DEFAULT_DAY, fitToDay } from './schedule'
import { recipeFromStyle } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

const H = 3600000

describe('fitting the plan around your day', () => {
  it('builds sleep windows that cross midnight', () => {
    const from = new Date(2026, 5, 3, 12, 0).getTime()
    const bl = blocks(DEFAULT_DAY, from, from + 24 * H)
    const night = bl.find((b) => b.kind === 'sleep' && b.start > from)!
    expect(new Date(night.start).getHours()).toBe(23)
    expect((night.end - night.start) / H).toBe(8)
  })

  it('moves a 2 am mix to the evening by stretching the fridge time', () => {
    const r = recipeFromStyle('ny', { ...DEFAULT_SETTINGS, roomC: 21, fridgeC: 4 })
    r.final.phases = [makePhase('room', 1, 'bulk'), makePhase('fridge', 36, 'balls'), makePhase('room', 4, 'balls')]
    const bakeMs = new Date(2026, 5, 6, 19, 0).getTime()
    r.bakeAt = new Date(bakeMs).toISOString()
    const res = computeRecipe(r, { bakeAtMs: bakeMs })
    const before = clashes(res.timeline, bakeMs, DEFAULT_DAY)
    expect(before.map((c) => c.event.id)).toContain('final-mix')
    const fit = fitToDay(r, {}, bakeMs, DEFAULT_DAY)
    expect(fit.remaining).toHaveLength(0)
    const mix = fit.result.timeline.find((e) => e.id === 'final-mix')!
    const mixAt = new Date(bakeMs + mix.atH * H)
    expect(mixAt.getHours() < 23 && mixAt.getHours() >= 7).toBe(true)
    // Only the fridge phase changed, and the dough is still ripe on time.
    expect(fit.recipe.final.phases[0].hours).toBe(1)
    expect(fit.recipe.final.phases[2].hours).toBe(4)
    expect(fit.recipe.final.phases[1].hours).not.toBe(36)
    expect(fit.result.stages.at(-1)!.ripeness).toBeCloseTo(1, 3)
    expect(fit.changes.map((c) => c.title)).toContain('Mix the dough')
  })

  it('also avoids working hours on weekdays', () => {
    const r = recipeFromStyle('neapolitan', { ...DEFAULT_SETTINGS, roomC: 21, fridgeC: 4 })
    r.final.phases = [makePhase('room', 2, 'bulk'), makePhase('fridge', 20, 'balls'), makePhase('room', 3, 'balls')]
    // Bake Thursday 19:00 → mix Wednesday ~17:40, balls into the fridge ~19:40 (fine); make it clash.
    const bakeMs = new Date(2026, 5, 4, 12, 0).getTime()
    r.bakeAt = new Date(bakeMs).toISOString()
    const day = { ...DEFAULT_DAY, workOn: true }
    const res = computeRecipe(r, { bakeAtMs: bakeMs })
    expect(clashes(res.timeline, bakeMs, day).length).toBeGreaterThan(0)
    const fit = fitToDay(r, {}, bakeMs, day)
    expect(fit.remaining).toHaveLength(0)
  })
})
