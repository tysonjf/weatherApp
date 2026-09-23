import { describe, expect, it } from 'vitest'
import { impliedStarterSpeed, impliedYeastScale, snapshotOf, suggestCalibration, type JournalEntry } from './calibration'
import { computeRecipe } from './compute'
import { pressureRatio } from './altitude'
import { recipeFromStyle } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

function entry(over: Partial<JournalEntry>, plan: Partial<JournalEntry['plan']> = {}): JournalEntry {
  return {
    id: 'j',
    recipeId: 'r',
    recipeName: 'Test',
    styleId: 'neapolitan',
    bakedAt: Date.now(),
    createdAt: Date.now(),
    rating: 4,
    proof: 'right',
    readyOffsetH: null,
    notes: '',
    plan: {
      leavening: 'yeast',
      eqHours21: 12,
      sdDoublings: 3,
      lastEnvC: 21,
      yeastScale: 1,
      starterSpeed: 1,
      hydration: 62,
      saltPct: 2.8,
      totalHours: 24,
      roomC: 21,
      yeastPct: 0.05,
      method: 'Direct',
      ...plan,
    },
    ...over,
  }
}

describe('learning from the journal', () => {
  it('turns "ready an hour late" into more yeast, relative to the calibration used', () => {
    const late = impliedYeastScale(entry({ readyOffsetH: 1 }))!
    expect(late).toBeGreaterThan(1.05)
    expect(late).toBeLessThan(1.3)
    const early = impliedYeastScale(entry({ readyOffsetH: -1 }))!
    expect(early).toBeLessThan(0.95)
    // Already on a 120 % calibration and still late: go higher still.
    expect(impliedYeastScale(entry({ readyOffsetH: 1 }, { yeastScale: 1.2 }))!).toBeCloseTo(late * 1.2, 6)
    expect(impliedYeastScale(entry({ proof: 'under' }))!).toBeGreaterThan(1)
    expect(impliedStarterSpeed(entry({ readyOffsetH: 1 }))).toBeNull()
  })

  it('turns a sourdough bake into a starter speed', () => {
    const slow = impliedStarterSpeed(entry({ readyOffsetH: 2 }, { leavening: 'sourdough' }))!
    expect(slow).toBeLessThan(1)
    const fast = impliedStarterSpeed(entry({ readyOffsetH: -2 }, { leavening: 'sourdough' }))!
    expect(fast).toBeGreaterThan(1)
  })

  it('weights recent bakes more', () => {
    const now = Date.now()
    const s = suggestCalibration([
      entry({ id: 'a', bakedAt: now - 3 * 86400000, readyOffsetH: -1 }),
      entry({ id: 'b', bakedAt: now, readyOffsetH: 1 }),
    ])
    expect(s.yeast!.n).toBe(2)
    expect(s.yeast!.value).toBeGreaterThan(1)
    expect(s.starter).toBeNull()
  })

  it('snapshots a plan for later', () => {
    const r = recipeFromStyle('neapolitan', DEFAULT_SETTINGS)
    const res = computeRecipe(r)
    const snap = snapshotOf(r, res, { yeastScale: 1, starterSpeed: 1 }, 'Direct')
    expect(snap.leavening).toBe('yeast')
    expect(snap.eqHours21).toBeGreaterThan(5)
  })

  it('corrects for altitude', () => {
    expect(pressureRatio(0)).toBeCloseTo(1, 6)
    expect(pressureRatio(1524)).toBeCloseTo(0.832, 2)
    const r = recipeFromStyle('neapolitan', DEFAULT_SETTINGS)
    const sea = computeRecipe(r).stages.at(-1)!.leavening.freshPct
    const denver = computeRecipe(r, { altitudeM: 1600 }).stages.at(-1)!.leavening.freshPct
    expect(denver / sea).toBeCloseTo(pressureRatio(1600), 3)
  })
})
