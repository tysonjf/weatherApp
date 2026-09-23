import { describe, expect, it } from 'vitest'
import { computeRecipe } from './compute'
import { makePhase } from './phases'
import { DEFAULT_PARTY, piecesFor, servicePlan, shoppingList, toppingsPerPizza } from './party'
import { recipeFromStyle } from '../state/recipes'
import { DEFAULT_SETTINGS } from '../state/settings'

const H = 3600000

describe('pizza night', () => {
  it('counts pizzas by style and appetite', () => {
    const neap = recipeFromStyle('neapolitan', DEFAULT_SETTINGS)
    expect(piecesFor(neap, 250, { ...DEFAULT_PARTY, adults: 4, spare: false })).toBe(4)
    expect(piecesFor(neap, 250, { ...DEFAULT_PARTY, adults: 4, kids: 2, spare: true })).toBe(6)
    const ny = recipeFromStyle('ny', DEFAULT_SETTINGS)
    // 6 people × ~200 g of dough each from 450 g pies.
    expect(piecesFor(ny, 450, { ...DEFAULT_PARTY, adults: 6, spare: false })).toBe(3)
    expect(piecesFor(ny, 450, { ...DEFAULT_PARTY, adults: 6, appetite: 'hungry', spare: false })).toBe(4)
  })

  it('tops a Neapolitan like the AVPN and scales pan pizzas by area', () => {
    const neap = recipeFromStyle('neapolitan', DEFAULT_SETTINGS)
    const t = toppingsPerPizza(neap, 250)
    expect(t.find((x) => x.key === 'sauce')!.grams).toBeCloseTo(70, 6)
    expect(t.find((x) => x.key === 'cheese')!.grams).toBeCloseTo(90, 6)
    expect(t.find((x) => x.key === 'basil')!.count).toBe(4)
    const detroit = recipeFromStyle('detroit', DEFAULT_SETTINGS)
    const d = toppingsPerPizza(detroit, 520)
    // 10×14″ pan: about 340 g of brick cheese.
    expect(d.find((x) => x.key === 'cheese')!.grams).toBeGreaterThan(300)
    expect(d.find((x) => x.key === 'cheese')!.grams).toBeLessThan(380)
  })

  it('builds a shopping list with packs', () => {
    const r = recipeFromStyle('neapolitan', DEFAULT_SETTINGS)
    const res = computeRecipe(r)
    const list = shoppingList(r, res, 6, (g) => `${Math.round(g)} g`, 'Instant dry yeast')
    expect(list.find((l) => l.key === 'flour')!.grams).toBeCloseTo(res.totals.flour, 6)
    expect(list.find((l) => l.key === 'sauce')!.amount).toContain('× 400 g can')
    expect(list.find((l) => l.key === 'cheese')!.amount).toContain('× 125 g ball')
  })

  it('takes cold balls out in waves and checks the last pizza', () => {
    const r = recipeFromStyle('neapolitan', DEFAULT_SETTINGS)
    r.final.phases = [makePhase('room', 2, 'bulk'), makePhase('fridge', 20, 'balls'), makePhase('room', 3, 'balls')]
    const bakeMs = new Date(2026, 5, 6, 19, 0).getTime()
    r.bakeAt = new Date(bakeMs).toISOString()
    const res = computeRecipe(r, { bakeAtMs: bakeMs })
    const plan = servicePlan(r, res, bakeMs, 10, 4, 1, {})
    expect(plan.bakes).toHaveLength(10)
    expect(plan.waves.reduce((s, w) => s + w.count, 0)).toBe(10)
    expect(plan.waves[0].atMs).toBe(bakeMs - 3 * H)
    expect(plan.temperH).toBe(3)
    // The last ball waited 36 min longer in the fridge: a touch riper, still fine.
    expect(plan.lastRipeness).toBeGreaterThan(plan.firstRipeness)
    expect(plan.lastRipeness).toBeLessThan(1.1)
    // All at room temperature: the last pizzas are simply older.
    const room = recipeFromStyle('neapolitan', DEFAULT_SETTINGS)
    const rres = computeRecipe(room)
    const rplan = servicePlan(room, rres, bakeMs, 10, 4, 1, {})
    expect(rplan.waves).toHaveLength(0)
    expect(rplan.lastRipeness).toBeGreaterThan(rplan.firstRipeness)
  })
})
