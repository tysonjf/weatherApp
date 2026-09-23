/**
 * Recipe construction and conversion: new recipes from every style, every leavening method,
 * switching styles, migrating old saves and share links.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'
import { computeRecipe } from '../engine/compute'
import { markMixed } from '../engine/replan'
import { STYLES, styleById } from '../engine/presets'
import type { Recipe } from '../engine/types'
import { applyMethod, applyStyle, makePreferment, methodLabel, methodOf, migrateRecipe, recipeFromStyle, type MethodPreset } from './recipes'
import { DEFAULT_SETTINGS } from './settings'
import { decodeShared, shareUrl } from './share'

const METHODS: Exclude<MethodPreset, 'custom'>[] = ['direct', 'direct-sourdough', 'biga', 'poolish', 'biga-poolish', 'levain']

describe('recipeFromStyle', () => {
  for (const st of STYLES)
    it(`${st.id} starts from the style's numbers and the user's kitchen`, () => {
      const settings = { ...DEFAULT_SETTINGS, roomC: 23, tapC: 12, fridgeC: 3, yeastType: 'fresh' as const, mixerId: 'spiral' }
      const r = recipeFromStyle(st.id, settings)
      expect(r.styleId).toBe(st.id)
      expect(r.name).toBe(st.name)
      expect(r.ovenId).toBe(st.ovenId)
      expect(r.flourId).toBe(st.flourId)
      expect(r.hydration).toBe(st.hydration)
      expect(r.saltPct).toBe(st.saltPct)
      expect(r.oilPct).toBe(st.oilPct)
      expect(r.sugarPct).toBe(st.sugarPct)
      expect(r.maltPct).toBe(st.maltPct)
      expect(r.method).toBe(st.method)
      expect(r.sizing.mode).toBe(st.sizing.mode)
      expect(r.kitchen).toMatchObject({ roomC: 23, tapC: 12, fridgeC: 3, mixerId: 'spiral', targetFdtC: st.targetFdtC })
      expect(r.yeastType).toBe('fresh')
      expect(r.final.proofTarget).toBe(st.proofTarget)
      expect(r.preferments.length).toBe(st.method === 'indirect' ? (st.preferments?.length ?? 1) : 0)
      expect(r.bakeAt).toBeNull()
      expect(r.final.phases.length).toBeGreaterThan(0)
      // It computes to exactly the dough it asks for.
      const res = computeRecipe(r)
      expect(res.totals.dough).toBeCloseTo(res.pieces * res.pieceWeight * (1 + r.wastePct / 100), 6)
    })

  it('can force a direct style onto preferments and back', () => {
    const indirect = recipeFromStyle('neapolitan', DEFAULT_SETTINGS, true)
    expect(indirect.method).toBe('indirect')
    expect(indirect.preferments.map((p) => p.type)).toEqual(['poolish'])
    const direct = recipeFromStyle('canotto', DEFAULT_SETTINGS, false)
    expect(direct.method).toBe('direct')
    expect(direct.preferments).toEqual([])
  })

  it('gives every recipe and preferment its own id', () => {
    const a = recipeFromStyle('canotto')
    const b = recipeFromStyle('canotto')
    expect(a.id).not.toBe(b.id)
    const ids = [a, b].flatMap((r) => r.preferments.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('makePreferment', () => {
  it('uses the classic schedules in a normal kitchen', () => {
    const biga = makePreferment('biga', 40, { roomC: 20 })
    expect(biga.flourPct).toBe(40)
    expect(biga.phases.every((p) => p.location !== 'fridge')).toBe(true)
    const poolish = makePreferment('poolish', undefined, { roomC: 20 })
    expect(poolish.phases.every((p) => p.location !== 'fridge')).toBe(true)
  })

  it('moves biga and poolish to the fridge in a hot kitchen', () => {
    const biga = makePreferment('biga', 40, { roomC: 26 })
    expect(biga.phases.map((p) => p.location)).toEqual(['room', 'fridge'])
    const poolish = makePreferment('poolish', 30, { roomC: 27 })
    expect(poolish.phases.map((p) => p.location)).toEqual(['room', 'fridge'])
  })

  it('manual amounts default to sensible starting points', () => {
    expect(makePreferment('biga').manualPct).toBeCloseTo(0.33, 9)
    expect(makePreferment('poolish').manualPct).toBeCloseTo(0.1, 9)
    expect(makePreferment('licoli').manualPct).toBe(50)
  })
})

describe('applyMethod', () => {
  const expected: Record<(typeof METHODS)[number], string[]> = {
    direct: [],
    'direct-sourdough': [],
    biga: ['biga'],
    poolish: ['poolish'],
    'biga-poolish': ['biga', 'poolish'],
    levain: ['licoli'],
  }

  for (const st of STYLES)
    for (const m of METHODS)
      it(`${st.id} → ${m}`, () => {
        const r = applyMethod(recipeFromStyle(st.id), m, DEFAULT_SETTINGS)
        expect(r.preferments.map((p) => p.type)).toEqual(expected[m])
        expect(r.method).toBe(m.startsWith('direct') ? 'direct' : 'indirect')
        if (m === 'direct') expect(r.directLeavening).toBe('yeast')
        if (m === 'direct-sourdough') expect(r.directLeavening).toBe('sourdough')
        // The method reads back as the one applied.
        expect(methodOf(r)).toBe(m)
        // A levain is the only leavening: no commercial yeast, sized to ripen on time.
        if (m === 'levain') {
          expect(r.final.extraYeastMode).toBe('none')
          const pct = r.preferments[0].flourPct
          expect(pct).toBeGreaterThanOrEqual(3)
          expect(pct).toBeLessThanOrEqual(30)
          const final = computeRecipe(r).stages.at(-1)!
          expect(final.leavening.freshPct).toBe(0)
          if (pct > 3 && pct < 30) expect(final.ripeness).toBeCloseTo(1, 1)
        }
        // Everything still computes.
        expect(Number.isFinite(computeRecipe(r).totalHours)).toBe(true)
      })

  it('sizes preferments to the dough', () => {
    const wet = applyMethod({ ...recipeFromStyle('canotto'), hydration: 72 }, 'biga', DEFAULT_SETTINGS)
    expect(wet.preferments[0].flourPct).toBe(50)
    const dry = applyMethod({ ...recipeFromStyle('neapolitan'), hydration: 62 }, 'biga', DEFAULT_SETTINGS)
    expect(dry.preferments[0].flourPct).toBe(40)
    // A poolish is 100 % hydration, so its flour can't carry more water than the dough has.
    const lean = applyMethod({ ...recipeFromStyle('ny'), hydration: 30 }, 'poolish', DEFAULT_SETTINGS)
    expect(lean.preferments[0].flourPct).toBe(25)
    const both = applyMethod(recipeFromStyle('canotto'), 'biga-poolish', DEFAULT_SETTINGS)
    const pf = both.preferments.map((p) => p.flourPct)
    expect(pf[0]).toBe(30)
    expect(pf[1]).toBeLessThanOrEqual(20)
  })

  it('keeps the final schedule when switching between preferments', () => {
    const biga = applyMethod(recipeFromStyle('neapolitan'), 'biga', DEFAULT_SETTINGS)
    const custom = biga.final.phases.map((p) => ({ ...p, hours: p.hours + 1 }))
    const poolish = applyMethod({ ...biga, final: { ...biga.final, phases: custom } }, 'poolish', DEFAULT_SETTINGS)
    expect(poolish.final.phases).toEqual(custom)
    // Leaving preferments restores a direct schedule.
    const direct = applyMethod(poolish, 'direct', DEFAULT_SETTINGS)
    expect(direct.final.phases).not.toEqual(custom)
    expect(direct.preferments).toEqual([])
  })

  it('custom keeps the preferments you built', () => {
    const r = applyMethod(recipeFromStyle('canotto'), 'biga', DEFAULT_SETTINGS)
    const withMore = { ...r, preferments: [...r.preferments, makePreferment('poolish', 10)] }
    const custom = applyMethod(withMore, 'custom', DEFAULT_SETTINGS)
    expect(custom.preferments).toEqual(withMore.preferments)
    expect(methodOf(custom)).toBe('biga-poolish')
    expect(methodOf({ ...custom, preferments: [...custom.preferments, makePreferment('biga', 10)] })).toBe('custom')
  })
})

describe('methodLabel', () => {
  it('names the leavening', () => {
    expect(methodLabel(recipeFromStyle('neapolitan'))).toBe('Direct')
    expect(methodLabel(applyMethod(recipeFromStyle('neapolitan'), 'direct-sourdough', DEFAULT_SETTINGS))).toBe('Direct sourdough')
    expect(methodLabel(applyMethod(recipeFromStyle('canotto'), 'biga-poolish', DEFAULT_SETTINGS))).toMatch(/^Biga 30% \+ Poolish \d+%$/)
  })
})

describe('applyStyle', () => {
  it('switches the numbers but keeps identity, plan and kitchen', () => {
    const r: Recipe = {
      ...recipeFromStyle('neapolitan', { ...DEFAULT_SETTINGS, yeastType: 'active-dry', mixerId: 'spiral' }),
      notes: 'my notes',
      bakeAt: '2026-06-06T17:00:00.000Z',
    }
    r.kitchen = { ...r.kitchen, roomC: 26, tapC: 14 }
    const next = applyStyle(r, 'detroit', DEFAULT_SETTINGS)
    const st = styleById('detroit')
    expect(next.styleId).toBe('detroit')
    expect(next.hydration).toBe(st.hydration)
    expect(next.sizing.mode).toBe('pans')
    expect(next.id).toBe(r.id)
    expect(next.createdAt).toBe(r.createdAt)
    expect(next.bakeAt).toBe(r.bakeAt)
    expect(next.notes).toBe('my notes')
    expect(next.yeastType).toBe('active-dry')
    expect(next.kitchen).toMatchObject({ roomC: 26, tapC: 14, mixerId: 'spiral', targetFdtC: st.targetFdtC })
  })
})

describe('migrateRecipe', () => {
  it('rejects things that are not recipes', () => {
    for (const bad of [null, undefined, 0, 'recipe', [], {}, { styleId: 'neapolitan' }, { hydration: 65 }, { styleId: 3, hydration: 65 }])
      expect(migrateRecipe(bad)).toBeNull()
  })

  it('fills in everything an old save is missing', () => {
    const full = applyMethod(recipeFromStyle('canotto'), 'biga-poolish', DEFAULT_SETTINGS)
    // What an early version saved: no night temperature, flour blend, autolyse, folds, live or party
    // fields, and preferments without the newer options.
    const old = JSON.parse(JSON.stringify(full)) as Record<string, unknown> & Recipe
    delete (old.kitchen as Partial<Recipe['kitchen']>).nightC
    delete (old.final as Partial<Recipe['final']>).autolyseMin
    delete (old.final as Partial<Recipe['final']>).folds
    delete (old.final as Partial<Recipe['final']>).foldEveryMin
    delete old.flour2Id
    delete old.flour2Pct
    delete old.live
    delete old.party
    for (const p of old.preferments) {
      delete (p as Partial<typeof p>).targetTempC
      delete (p as Partial<typeof p>).seedHydration
    }
    const m = migrateRecipe(old)!
    expect(m).not.toBeNull()
    expect(m.id).toBe(full.id)
    expect(m.kitchen.nightC).toBeDefined()
    expect(m.final.autolyseMin).toBe(0)
    expect(m.preferments.map((p) => p.id)).toEqual(full.preferments.map((p) => p.id))
    const a = computeRecipe(m, { bakeAtMs: Date.UTC(2026, 5, 6, 17) })
    const b = computeRecipe(full, { bakeAtMs: Date.UTC(2026, 5, 6, 17) })
    expect(a.totals.dough).toBeCloseTo(b.totals.dough, 6)
    expect(a.totals.yeast).toBeCloseTo(b.totals.yeast, 6)
  })

  it('gives recipes without an id a fresh one', () => {
    const { id: _id, ...rest } = recipeFromStyle('ny')
    const m = migrateRecipe(rest)!
    expect(typeof m.id).toBe('string')
    expect(m.id.length).toBeGreaterThan(0)
  })
})

describe('share links', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('round-trip a recipe as a fresh plan', () => {
    vi.stubGlobal('window', { location: { origin: 'https://pizza.example' } })
    const r = applyMethod(recipeFromStyle('canotto'), 'biga-poolish', DEFAULT_SETTINGS)
    r.name = 'Friday canotto'
    r.bakeAt = '2026-06-06T17:00:00.000Z'
    const bakeAtMs = Date.parse(r.bakeAt)
    const res = computeRecipe(r, { bakeAtMs })
    // The biga went in on time, at 19 °C: its amounts are now locked.
    const biga = res.stages.find((s) => s.id === r.preferments[0].id)!
    const live = markMixed(r, res, biga.id, bakeAtMs + biga.startH * 3600000, 19, bakeAtMs)
    expect(live.preferments[0].amountMode).toBe('manual')

    const url = shareUrl(live)
    expect(url.startsWith('https://pizza.example/#/import?r=')).toBe(true)
    const back = decodeShared(url.split('r=')[1])!
    expect(back).not.toBeNull()
    expect(back.name).toBe('Friday canotto')
    expect(back.id).not.toBe(r.id)
    // Your live progress and bake time stay with you: the link is the plan, fresh.
    expect(back.live).toBeUndefined()
    expect(back.bakeAt).toBeNull()
    expect(back.preferments.map((p) => [p.type, p.flourPct, p.amountMode, p.measuredMixC ?? null])).toEqual(
      r.preferments.map((p) => [p.type, p.flourPct, 'auto', null]),
    )
    expect(back.preferments.map((p) => p.phases)).toEqual(r.preferments.map((p) => p.phases))
    expect(back.final).toEqual(r.final)
    const again = computeRecipe(back, { bakeAtMs })
    expect(again.totals.dough).toBeCloseTo(res.totals.dough, 9)
    expect(again.totals.yeast).toBeCloseTo(res.totals.yeast, 9)
  })

  it('reject garbage', () => {
    expect(decodeShared('')).toBeNull()
    expect(decodeShared('not-a-recipe')).toBeNull()
    expect(decodeShared(compressToEncodedURIComponent('{"hello":1}'))).toBeNull()
    expect(decodeShared(compressToEncodedURIComponent('[1,2'))).toBeNull()
  })
})
