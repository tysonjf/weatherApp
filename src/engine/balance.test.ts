/**
 * One-tap fixes for plans that won't be ripe at the bake: every fix the app offers must land the dough
 * in the window, change only what it says it changes, and new doughs must start out balanced.
 */
import { describe, expect, it } from 'vitest'
import { BALANCE_BAND, balanceFixes, balanceNeed, bigaSplitFix, type BalanceFix } from './balance'
import { computeRecipe } from './compute'
import { makePhase } from './phases'
import { STYLES, scheduleById } from './presets'
import { markMixed } from './replan'
import type { Recipe } from './types'
import { applyMethod, makePreferment, newRecipe, recipeFromStyle, type MethodPreset } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

const BAKE = new Date(2026, 8, 25, 19, 0).getTime()
const opts = { bakeAtMs: BAKE }
const run = (r: Recipe) => computeRecipe(r, opts)
const finalOf = (r: Recipe) => run(r).stages.find((s) => s.id === 'final')!
const hours = (r: Recipe) => r.final.phases.reduce((s, p) => s + Math.max(0, p.hours), 0)
const withSchedule = (r: Recipe, id: string): Recipe => ({
  ...r,
  final: { ...r.final, phases: scheduleById(id).phases.map((p) => makePhase(p.location, p.hours, p.stage)) },
})
const settings = (roomC: number) => ({ ...DEFAULT_SETTINGS, roomC })

/** The plan from the bug report: 50 % biga, 2 h room → 22 h fridge, cold balls for 24 h, 24 °C kitchen. */
function reported(): Recipe {
  const s = settings(24)
  const r = newRecipe('canotto', s, 'biga')
  return withSchedule({ ...r, preferments: [{ ...makePreferment('biga', 50, s), phases: [makePhase('room', 2), makePhase('fridge', 22)] }] }, 'cold-balls-24')
}

function checkFix(before: Recipe, fix: BalanceFix) {
  const res = run(fix.recipe)
  const f = res.stages.find((s) => s.id === 'final')!
  expect(f.ripeness, fix.title).toBeCloseTo(fix.ripeness, 9)
  expect(fix.ripeness, fix.title).toBeGreaterThanOrEqual(0.9)
  expect(fix.ripeness, fix.title).toBeLessThanOrEqual(fix.id === 'biga-split' ? BALANCE_BAND.over : 1.1)
  expect(res.advice.filter((a) => a.severity === 'error'), fix.title).toEqual([])
  expect(fix.title.length).toBeGreaterThan(0)
  expect(fix.detail.length).toBeGreaterThan(0)
  const r = fix.recipe
  switch (fix.id) {
    case 'shorter':
    case 'longer':
      expect(r.preferments).toEqual(before.preferments)
      expect(hours(r) < hours(before)).toBe(fix.id === 'shorter')
      // A fridge stint too short to cool anything is dropped rather than kept.
      for (const p of r.final.phases) if (p.location === 'fridge' && p.hours > 0) expect(p.hours).toBeGreaterThanOrEqual(1.5)
      break
    case 'fridge': {
      expect(r.preferments).toEqual(before.preferments)
      // Same start and bake time.
      expect(hours(r)).toBeCloseTo(hours(before), 9)
      const cold = (x: Recipe) => x.final.phases.filter((p) => p.location === 'fridge').reduce((s, p) => s + p.hours, 0)
      expect(cold(r)).toBeGreaterThan(cold(before))
      expect(r.final.phases.at(-1)!.location).not.toBe('fridge')
      break
    }
    case 'share':
      expect(r.final).toEqual(before.final)
      for (const [i, p] of r.preferments.entries()) {
        expect(p.phases).toEqual(before.preferments[i].phases)
        expect(p.flourPct).toBeGreaterThanOrEqual(10)
      }
      break
    case 'biga-split': {
      expect(r.final).toEqual(before.final)
      const biga = res.stages.find((s) => s.type === 'biga')!
      expect(biga.leavening.freshPct).toBeLessThan(1.4)
      const total = (x: Recipe) => x.preferments[0].phases.reduce((s, p) => s + p.hours, 0)
      expect(total(r)).toBeCloseTo(total(before), 9)
      break
    }
    case 'auto':
      expect(r.final.phases).toEqual(before.final.phases)
      break
  }
}

describe('over-fermenting plans get fixes that land ripe', () => {
  const cases: [string, () => Recipe][] = [
    ['the reported plan: fridge biga + cold balls at 24 °C', reported],
    ['50 % room biga, cold balls 24 h at 26 °C', () => withSchedule(applyMethod(recipeFromStyle('canotto', settings(26)), 'biga', settings(26)), 'cold-balls-24')],
    ['50 % biga, 1 h + 4 h at room in a 28 °C kitchen', () => withSchedule(applyMethod(recipeFromStyle('canotto', settings(28)), 'biga', settings(28)), 'after-preferment')],
    ['biga + poolish, 24 h at room', () => withSchedule(applyMethod(recipeFromStyle('canotto', settings(22)), 'biga-poolish', settings(22)), 'room-24')],
    ['NY with 1 % instant yeast set by hand', () => {
      const r = recipeFromStyle('ny', settings(21))
      return { ...r, final: { ...r.final, extraYeastMode: 'manual', extraYeastPct: 1 } }
    }],
  ]
  for (const [name, make] of cases)
    it(name, () => {
      const r = make()
      const res = run(r)
      expect(balanceNeed(r, res)).toBe('over')
      expect(res.advice.some((a) => a.id === 'final-over')).toBe(true)
      const fixes = balanceFixes(r, res, opts)
      expect(fixes.length).toBeGreaterThan(0)
      expect(new Set(fixes.map((f) => f.id)).size).toBe(fixes.length)
      for (const f of fixes) checkFix(r, f)
    })

  it('the reported plan leads with the biga, the real cause', () => {
    const r = reported()
    const res = run(r)
    const biga = res.stages[0]
    expect(biga.leavening.freshPct).toBeGreaterThan(2)
    expect(res.advice.find((a) => a.id === 'biga-split')?.scope).toBe(biga.id)
    const fixes = balanceFixes(r, res, opts)
    expect(fixes[0].id).toBe('biga-split')
    expect(fixes.map((f) => f.id)).toContain('share')
    // One tap and the over-fermenting warning is gone.
    const after = run(fixes[0].recipe)
    expect(after.advice.some((a) => a.id === 'final-over')).toBe(false)
    const shape = (x: Recipe) => x.preferments[0].phases.map((p) => [p.location, p.hours])
    expect(shape(bigaSplitFix(r, biga.id, opts)!.recipe)).toEqual(shape(fixes[0].recipe))
  })
})

describe('under-fermenting plans get fixes too', () => {
  it('a levain dough given a short final rise', () => {
    const lv = withSchedule(applyMethod(recipeFromStyle('neapolitan', settings(21)), 'levain', settings(21)), 'after-preferment')
    const res = run(lv)
    expect(balanceNeed(lv, res)).toBe('under')
    expect(res.advice.some((a) => a.id === 'final-under')).toBe(true)
    const fixes = balanceFixes(lv, res, opts)
    expect(fixes.map((f) => f.id).sort()).toEqual(['auto', 'longer', 'share'])
    for (const f of fixes) checkFix(lv, f)
  })

  it('a direct dough with too little yeast set by hand', () => {
    const r0 = recipeFromStyle('neapolitan', settings(21))
    const r = { ...r0, final: { ...r0.final, extraYeastMode: 'manual' as const, extraYeastPct: 0.005 } }
    const res = run(r)
    expect(balanceNeed(r, res)).toBe('under')
    const fixes = balanceFixes(r, res, opts)
    expect(fixes.some((f) => f.id === 'auto')).toBe(true)
    for (const f of fixes) checkFix(r, f)
  })
})

describe('when not to offer fixes', () => {
  it('a balanced plan needs none', () => {
    const r = newRecipe('neapolitan', settings(21))
    const res = run(r)
    expect(balanceNeed(r, res)).toBeNull()
    expect(balanceFixes(r, res, opts)).toEqual([])
  })

  it('once a stage is mixed, re-planning takes over', () => {
    const r = reported()
    const res = run(r)
    const biga = res.stages[0]
    const live = markMixed(r, res, biga.id, BAKE + biga.startH * 3600000, 19, BAKE)
    expect(balanceNeed(live, run(live))).toBeNull()
    expect(balanceFixes(live, run(live), opts)).toEqual([])
  })
})

describe('new doughs start balanced', () => {
  const METHODS: (MethodPreset | undefined)[] = [undefined, 'direct', 'biga', 'poolish', 'biga-poolish', 'levain']
  for (const st of STYLES)
    it(st.name, () => {
      for (const roomC of [18, 21, 24, 27, 30])
        for (const m of METHODS) {
          const r = newRecipe(st.id, settings(roomC), m)
          const f = finalOf(r)
          const label = `${st.id} · ${m ?? 'style default'} · ${roomC} °C`
          if (f.ripeness > BALANCE_BAND.over)
            // Only when no change of schedule can fix it; the warning then offers what can.
            expect(balanceFixes(r, run(r), opts).filter((x) => x.id === 'shorter' || x.id === 'fridge'), label).toEqual([])
          expect(f.ripeness, label).toBeGreaterThan(0.85)
        }
    })
})
