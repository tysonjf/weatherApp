/**
 * Invariants over the whole design space: every style × every leavening method × cold to hot kitchens,
 * with and without a room that cools at night. Whatever the inputs, the plan must add up (mass and
 * baker's percentages), never produce NaN, ripen automatic stages exactly on time, respect the water
 * and ice limits, and lay out a sane timeline and bake guide.
 */
import { describe, expect, it } from 'vitest'
import { MAX_TEMPER_H, computeRecipe } from './compute'
import { balanceFixes } from './balance'
import { buildGuide } from './instructions'
import { STYLES } from './presets'
import type { Recipe, RecipeResult } from './types'
import { applyMethod, recipeFromStyle, type MethodPreset } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

const METHODS: MethodPreset[] = ['direct', 'direct-sourdough', 'biga', 'poolish', 'biga-poolish', 'levain']
const ROOMS = [16, 21, 27, 32]
const BAKE = new Date(2026, 5, 6, 19, 0).getTime()

interface Variant {
  label: string
  recipe: Recipe
}

function variants(styleId: string): Variant[] {
  const out: Variant[] = []
  for (const m of METHODS)
    for (const roomC of ROOMS)
      for (const night of [false, true]) {
        const s = { ...DEFAULT_SETTINGS, roomC, nightC: night ? roomC - 4 : null }
        const r = applyMethod(recipeFromStyle(styleId, s), m, s)
        r.bakeAt = new Date(BAKE).toISOString()
        out.push({ label: `${styleId} · ${m} · ${roomC} °C${night ? ' · cool nights' : ''}`, recipe: r })
      }
  return out
}

/** Every non-finite number in a result, with its path. */
function nonFinite(value: unknown, path = 'result', out: string[] = []): string[] {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} = ${value}`)
  } else if (Array.isArray(value)) value.forEach((v, i) => nonFinite(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) nonFinite(v, `${path}.${k}`, out)
  return out
}

const near = (a: number, b: number, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b))

function check(v: Variant, res: RecipeResult) {
  const r = v.recipe
  const at = (what: string) => `${v.label}: ${what}`

  // 1. Numbers are numbers (the only allowed non-finite value is the water temperature of a mix with no water).
  const bad = nonFinite(res).filter((p) => !/waterPlan\.(idealWaterC|waterC|classicWaterC)/.test(p) && !/window\.(readyH|bestH|untilH)/.test(p))
  expect(bad, at('non-finite numbers')).toEqual([])

  // 2. Mass: exactly the dough the sizing asks for, split by baker's percentages.
  const t = res.totals
  const wanted = res.pieces * res.pieceWeight * (1 + r.wastePct / 100)
  expect(near(t.dough, wanted), at(`dough ${t.dough} vs ${wanted}`)).toBe(true)
  expect(near(t.water / t.flour, r.hydration / 100), at('hydration')).toBe(true)
  expect(near(t.salt / t.flour, r.saltPct / 100), at('salt')).toBe(true)
  expect(near(t.oil / t.flour, r.oilPct / 100), at('oil')).toBe(true)
  for (const s of res.stages)
    for (const l of s.ingredients) expect(l.grams, at(`${s.title} · ${l.label} is negative`)).toBeGreaterThanOrEqual(-1e-9)
  const final = res.stages.find((s) => s.id === 'final')!
  const finalSum = final.ingredients.reduce((sum, l) => sum + l.grams, 0)
  expect(near(finalSum, final.totalWeight, 1e-6), at('final ingredients add up')).toBe(true)
  expect(near(final.totalWeight, t.dough, 1e-6), at('final dough is the whole dough')).toBe(true)

  // 3. Ripeness: automatic stages are ripe exactly when needed.
  for (const s of res.stages) {
    if (s.kind !== 'preferment') continue
    const spec = r.preferments.find((p) => p.id === s.id)!
    const clamped = spec.leavening === 'sourdough' && (s.leavening.starterPct >= 199.9 || s.leavening.starterPct <= 2.01)
    if (spec.amountMode === 'auto' && !clamped) expect(s.ripeness, at(`${s.title} ripe at the final mix`)).toBeCloseTo(1, 2)
  }
  const directStarterClamped = r.method === 'direct' && r.directLeavening === 'sourdough' && (final.leavening.starterPct >= 59.9 || final.leavening.starterPct <= 0.51)
  if (r.method === 'direct' && !directStarterClamped) expect(final.ripeness, at('direct dough ripe at the bake')).toBeCloseTo(1, 2)
  if (r.method === 'indirect' && r.final.extraYeastMode === 'auto') {
    // Extra yeast can only add (a pinch under 5 % of the need is skipped): ripe, or riper when the
    // preferments alone carry enough — and then it says so and offers fixes.
    expect(final.ripeness, at('indirect dough at least ripe')).toBeGreaterThan(0.95)
    if (final.ripeness > 1.15) expect(res.advice.some((a) => a.id === 'final-over'), at('over-ripe advice')).toBe(true)
  }
  // New plans start balanced whenever a fix exists (a night-time cycle depends on the bake time, which
  // a new plan doesn't have yet: those get the warning and its fixes instead).
  if (final.ripeness > 1.15 && r.method === 'indirect' && r.kitchen.nightC == null)
    expect(balanceFixes(r, res, { bakeAtMs: BAKE }).filter((f) => f.id === 'shorter' || f.id === 'fridge'), at('left unbalanced')).toEqual([])

  // 4. Water and ice stay within what a kitchen can do.
  for (const s of res.stages) {
    const w = s.waterPlan
    if (!w) continue
    expect(['ok', 'ice', 'too-cold', 'too-hot'], at(`${s.title} water status`)).toContain(w.status)
    if (Number.isFinite(w.waterC)) expect(w.waterC, at(`${s.title} water ≤ the warmest allowed`)).toBeLessThanOrEqual(w.maxWaterC + 1e-9)
    expect(w.maxWaterC).toBe(30)
    expect(w.extraMixMin, at('extra mixing')).toBeGreaterThanOrEqual(0)
    if (w.extraMixMin > 0) expect(w.status, at('mixes longer only when the water is capped')).toBe('too-hot')
    expect(w.iceG, at(`${s.title} ice ≥ 0`)).toBeGreaterThanOrEqual(0)
    expect(w.iceG, at(`${s.title} ice ≤ 35 % of the water`)).toBeLessThanOrEqual(0.35 * (w.iceG + w.liquidG) + 1e-6)
    if (w.status === 'ok' || w.status === 'ice') expect(s.mixTempC, at(`${s.title} hits its target temperature`)).toBeCloseTo(w.targetC, 1)
    if (w.status === 'too-hot') expect(s.mixTempC, at(`${s.title} too-hot means below target`)).toBeLessThan(w.targetC)
    if (w.status === 'too-cold') expect(s.mixTempC, at(`${s.title} too-cold means above target`)).toBeGreaterThan(w.targetC)
  }

  // 4b. Rests out of the fridge: only after a cold phase, carved out of it (the preferment keeps its
  // length), at most MAX_TEMPER_H, in quarter hours, and announced in the timeline before the mix.
  for (const s of res.stages) {
    if (s.kind !== 'preferment') continue
    const spec = r.preferments.find((p) => p.id === s.id)!
    const rest = s.phases.filter((p) => p.temper)
    expect(rest.length, at('one rest at most')).toBeLessThanOrEqual(1)
    expect(s.temperH).toBeCloseTo(rest[0]?.hours ?? 0, 9)
    expect(s.phases.reduce((t, p) => t + p.hours, 0), at('rest carved out of the schedule')).toBeCloseTo(
      spec.phases.reduce((t, p) => t + Math.max(0, p.hours), 0),
      9,
    )
    if (rest.length) {
      expect(s.phases.at(-1)!.temper, at('rest comes last')).toBe(true)
      expect(s.phases.at(-2)!.location, at('rest follows the cold')).not.toBe('room')
      expect(rest[0].hours).toBeLessThanOrEqual(MAX_TEMPER_H)
      expect((rest[0].hours * 4) % 1).toBeCloseTo(0, 9)
      const ev = res.timeline.find((e) => e.id === `${s.id}-temper`)
      expect(ev, at('rest in the timeline')).toBeDefined()
      expect(ev!.atH).toBeCloseTo(rest[0].startH, 9)
    }
  }

  // 5. Timeline: ordered, unique, ends with the bake, starts the plan.
  const tl = res.timeline
  expect(new Set(tl.map((e) => e.id)).size, at('unique timeline ids')).toBe(tl.length)
  for (let i = 1; i < tl.length; i++) expect(tl[i].atH, at('timeline sorted')).toBeGreaterThanOrEqual(tl[i - 1].atH - 1e-9)
  expect(tl.at(-1)!.kind, at('ends with the bake')).toBe('bake')
  expect(tl.at(-1)!.atH).toBe(0)
  expect(-tl[0].atH, at('total hours = first step')).toBeCloseTo(res.totalHours, 6)
  const mixAt = tl.find((e) => e.id === 'final-mix')!.atH
  for (const e of tl.filter((x) => x.kind === 'build')) expect(e.atH, at('preferments before the final mix')).toBeLessThan(mixAt)
  for (const e of tl.filter((x) => x.kind === 'ball' || x.kind === 'temper' || x.kind === 'fold'))
    expect(e.atH, at(`${e.title} after mixing`)).toBeGreaterThan(mixAt)

  // 6. Curves and the bake window.
  for (const s of res.stages) {
    expect(s.curve.length, at(`${s.title} has a curve`)).toBeGreaterThan(1)
    expect(s.curve[0].ripeness).toBeCloseTo(0, 9)
    expect(s.curve.at(-1)!.ripeness, at(`${s.title} curve ends at its ripeness`)).toBeCloseTo(s.ripeness, 6)
    for (let i = 1; i < s.curve.length; i++) {
      expect(s.curve[i].ripeness, at(`${s.title} ripeness never falls`)).toBeGreaterThanOrEqual(s.curve[i - 1].ripeness - 1e-12)
      expect(s.curve[i].t).toBeGreaterThan(s.curve[i - 1].t)
    }
    for (const p of s.phases) expect(p.progress).toBeGreaterThanOrEqual(0)
  }
  const w = res.window
  if (w.readyH !== null && w.bestH !== null) expect(w.readyH, at('ready before best')).toBeLessThanOrEqual(w.bestH + 1e-9)
  if (w.bestH !== null && w.untilH !== null) expect(w.bestH, at('best before until')).toBeLessThanOrEqual(w.untilH + 1e-9)

  // 7. The bake guide: every step has a title, a body and a unique key, in time order.
  const guide = buildGuide(r, res, { temp: 'C', weight: 'g' })
  expect(new Set(guide.map((g) => g.key)).size, at('unique guide keys')).toBe(guide.length)
  for (const g of guide) {
    expect(g.title.length, at('guide title')).toBeGreaterThan(0)
    expect(g.body.filter((b) => b && b.trim()).length, at(`guide body: ${g.title}`)).toBeGreaterThan(0)
  }
  const timed = guide.filter((g) => g.atH !== undefined).map((g) => g.atH!)
  for (let i = 1; i < timed.length; i++) expect(timed[i], at('guide in time order')).toBeGreaterThanOrEqual(timed[i - 1] - 1e-9)

  // 8. Sanity of the fermentation load and advice.
  expect(res.fermentationLoad20, at('fermentation load')).toBeGreaterThan(0)
  for (const a of res.advice) expect(a.title.length, at('advice title')).toBeGreaterThan(0)
}

describe('every style × method × kitchen adds up', () => {
  for (const st of STYLES)
    it(st.name, () => {
      for (const v of variants(st.id)) check(v, computeRecipe(v.recipe, { bakeAtMs: BAKE }))
    })
})

describe('°F users never see °C', () => {
  for (const st of STYLES)
    it(st.name, () => {
      for (const m of METHODS) {
        const s = { ...DEFAULT_SETTINGS, tempUnit: 'F' as const }
        const r = applyMethod(recipeFromStyle(st.id, s), m, s)
        const res = computeRecipe(r, { tempUnit: 'F', bakeAtMs: BAKE })
        const texts = [
          ...res.timeline.flatMap((e) => [e.title, e.detail]),
          ...res.stages.flatMap((x) => x.ingredients.map((l) => l.note ?? '')),
          ...buildGuide(r, res, { temp: 'F', weight: 'g' }).flatMap((g) => [g.title, ...g.body]),
        ]
        const hits = texts.filter((x) => x.includes('°C'))
        expect(hits, `${st.id} · ${m}`).toEqual([])
      }
    })
})
