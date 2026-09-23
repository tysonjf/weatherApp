/**
 * Balancing a plan whose final dough won't be ripe at the bake. Instead of a warning to work out
 * alone, the baker gets concrete changes, each found by bisection and checked with the full model:
 *
 *  - over-fermenting (the preferments carry more leavening than the schedule needs, or too much was
 *    set by hand): a shorter final fermentation, more of it in the fridge, or a smaller preferment;
 *  - under-fermenting (a levain or a set amount too weak for the schedule): a longer final
 *    fermentation, a bigger preferment, or letting the app work out the yeast.
 */
import type { Phase, Recipe, RecipeResult } from './types'
import { computeRecipe, type ComputeOptions } from './compute'
import { hoursToReach } from './thermal'
import { formatHours, formatPct } from './units'
import { makePhase, uid } from './phases'
import { bigaRoomHours } from './fermentation'
import { prefermentPreset } from './presets'

export type BalanceFixId = 'shorter' | 'fridge' | 'share' | 'longer' | 'auto' | 'biga-split'

export interface BalanceFix {
  id: BalanceFixId
  /** Button text. */
  title: string
  /** What changes, in numbers. */
  detail: string
  recipe: Recipe
  /** Final ripeness at the bake with the fix applied. */
  ripeness: number
}

/** Final ripeness outside this band is worth fixing (the bake window is 0.85–1.3; aim for the middle). */
export const BALANCE_BAND = { under: 0.85, over: 1.15 }
/** A fix must land the dough within this band. */
const ACCEPT = { min: 0.9, max: 1.1 }

export function balanceNeed(r: Recipe, res: RecipeResult): 'over' | 'under' | null {
  // Once something is mixed, "Plans changed?" re-plans around what already happened instead.
  if (Object.keys(r.live?.mixed ?? {}).length) return null
  const f = res.stages.find((s) => s.id === 'final')
  if (!f || !(f.ripeness > 0)) return null
  return f.ripeness > BALANCE_BAND.over ? 'over' : f.ripeness < BALANCE_BAND.under ? 'under' : null
}

const live = (phases: Phase[]) => phases.filter((p) => p.hours > 0)
const quarter = (h: number) => Math.max(0.25, Math.round(h * 4) / 4)
const sumH = (phases: Phase[]) => phases.reduce((s, p) => s + Math.max(0, p.hours), 0)

/** x in [lo, hi] where the monotonic f crosses `target`. */
function solveFor(f: (x: number) => number, lo: number, hi: number, target = 1, iters = 12): number {
  const up = f(hi) > f(lo)
  let a = lo
  let b = hi
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2
    if (f(m) > target === up) b = m
    else a = m
  }
  return (a + b) / 2
}

function phaseText(p: Phase, pans: boolean): string {
  const what = p.stage === 'balls' ? (pans ? 'in the pan' : 'balls') : 'bulk'
  const where = p.location === 'fridge' ? ' in the fridge' : p.location === 'custom' ? ` at ${p.customTempC} °C` : ''
  return `${formatHours(p.hours)} ${what}${where}`
}

/**
 * Concrete fixes for a plan that won't be ripe at the bake (empty when it will be, or when nothing
 * simple works). `opts` must be the options the result was computed with, bake time included.
 */
export function balanceFixes(r: Recipe, res: RecipeResult, opts: ComputeOptions, only?: BalanceFixId[]): BalanceFix[] {
  const need = balanceNeed(r, res)
  if (!need) return []
  const want = (id: BalanceFixId) => !only || only.includes(id)
  // Over: aim a touch past ripe so rounding to quarter hours never leaves a pinch of yeast to add.
  const aim = need === 'over' ? 1.04 : 1
  const run = (x: Recipe) => computeRecipe(x, opts)
  const ripe = (x: Recipe) => run(x).stages.find((s) => s.id === 'final')!.ripeness
  const out: BalanceFix[] = []
  const accept = (id: BalanceFixId, title: string, detail: string, recipe: Recipe) => {
    const res2 = run(recipe)
    const rp = res2.stages.find((s) => s.id === 'final')!.ripeness
    if (rp < ACCEPT.min || rp > ACCEPT.max) return
    if (res2.advice.some((a) => a.severity === 'error')) return
    out.push({ id, title, detail, recipe, ripeness: rp })
  }

  // A biga that needs 2–3 % yeast because it spends its time cold is usually the cause: fix that first.
  if (need === 'over' && want('biga-split'))
    for (const p of r.preferments) {
      const fix = p.type === 'biga' ? bigaSplitFix(r, p.id, opts) : null
      if (fix && fix.ripeness >= ACCEPT.min && fix.ripeness <= BALANCE_BAND.over) out.push(fix)
    }

  const phases = r.final.phases
  const idx = phases.map((p, i) => (p.hours > 0 ? i : -1)).filter((i) => i >= 0)
  const oldTotal = sumH(phases)
  const pieceG = r.sizing.mode === 'pans' ? 250 : res.pieceWeight
  /** Time balls need out of the fridge to be workable (≈ 13 °C), at least an hour. */
  const warmUp = Math.max(1, Math.ceil(hoursToReach(r.kitchen.fridgeC + 1, 13, r.kitchen.roomC, pieceG) * 2) / 2)
  const withPhases = (next: Phase[]): Recipe => ({ ...r, final: { ...r.final, phases: next } })
  const pans = r.sizing.mode === 'pans'
  const scheduleText = (ps: Phase[]) => live(ps).map((p) => phaseText(p, pans)).join(' → ')
  const shift = (newTotal: number) => {
    const d = oldTotal - newTotal
    if (Math.abs(d) < 0.25) return ''
    return ` The final mix${r.method === 'indirect' ? ' and the preferments' : ''} move ${formatHours(Math.abs(d))} ${d > 0 ? 'later' : 'earlier'}.`
  }

  /* ---- Shorter / longer final fermentation, same shape ---- */
  if (want(need === 'over' ? 'shorter' : 'longer')) {
    const scaledFrom = (base: Phase[]) => {
      const li = base.map((p, i) => (p.hours > 0 ? i : -1)).filter((i) => i >= 0)
      // A warm-up after the fridge keeps what the balls need to become workable.
      const floor = (i: number) => {
        const prev = li[li.indexOf(i) - 1]
        const isWarmUp = prev !== undefined && base[prev].location === 'fridge' && base[i].location !== 'fridge'
        return isWarmUp ? Math.min(base[i].hours, warmUp) : 0.25
      }
      return (k: number) => base.map((p, i) => (p.hours > 0 ? { ...p, hours: need === 'over' ? Math.max(floor(i), p.hours * k) : p.hours * k } : p))
    }
    const solveScale = (base: Phase[]): Phase[] | null => {
      const scaled = scaledFrom(base)
      const f = (k: number) => ripe(withPhases(scaled(k)))
      const [lo, hi] = need === 'over' ? [0, 1] : [1, 3]
      if (need === 'over' ? f(lo) > ACCEPT.max : f(hi) < ACCEPT.min) return null
      return scaled(solveFor(f, lo, hi, aim)).map((p) => (p.hours > 0 ? { ...p, hours: quarter(p.hours) } : p))
    }
    let next = solveScale(phases)
    // A fridge stint under 1.5 h barely cools the dough: drop it and shorten the warm phases instead.
    if (need === 'over' && next?.some((p) => p.location === 'fridge' && p.hours > 0 && p.hours < 1.5)) {
      const warmOnly = phases.filter((p) => p.hours > 0 && p.location !== 'fridge')
      next = warmOnly.length ? solveScale(warmOnly) : null
    }
    if (next)
      accept(
        need === 'over' ? 'shorter' : 'longer',
        need === 'over' ? 'Shorter final rise' : 'Longer final rise',
        `${scheduleText(next)} (was ${scheduleText(phases)}).${shift(sumH(next))}`,
        withPhases(next),
      )
  }

  /* ---- More of it in the fridge, same start and bake time (over only) ---- */
  if (need === 'over' && idx.length && want('fridge')) {
    const lp = idx.map((i) => phases[i])
    const firstFridge = lp.findIndex((p) => p.location === 'fridge')
    let build: ((x: number) => Phase[]) | null = null
    let xMax = 0
    let title = ''
    if (firstFridge < 0) {
      // Ball, straight into the fridge, then out for the warm-up; bulk shortened to at most an hour.
      const bulk = lp[0].stage !== 'balls' ? Math.min(lp[0].hours, 1) : 0
      const rest = oldTotal - bulk
      xMax = rest - warmUp
      title = pans ? 'Pans in the fridge' : 'Balls in the fridge'
      build = (x) => [
        ...(bulk > 0 ? [{ ...lp[0], hours: bulk }] : []),
        { id: uid('ph'), location: 'fridge', hours: x, stage: 'balls', customTempC: 18 },
        { id: uid('ph'), location: 'room', hours: rest - x, stage: 'balls', customTempC: 18 },
      ]
    } else {
      // Move room time next to the fridge into it: bulk down to 30 min, the warm-up down to what it needs.
      const lastFridge = lp.length - 1 - [...lp].reverse().findIndex((p) => p.location === 'fridge')
      const before = lp.slice(0, firstFridge).filter((p) => p.location !== 'fridge')
      const after = lp.slice(lastFridge + 1)
      const spareBefore = Math.max(0, sumH(before) - 0.5)
      const spareAfter = Math.max(0, sumH(after) - warmUp)
      xMax = spareBefore + spareAfter
      title = 'More time in the fridge'
      build = (x) => {
        const fromBefore = Math.min(x, spareBefore)
        const fromAfter = x - fromBefore
        const shrink = (ps: Phase[], by: number, spare: number) =>
          spare > 0 ? ps.map((p) => ({ ...p, hours: p.hours - (by * p.hours) / sumH(ps) })) : ps
        const b2 = shrink(before, fromBefore, spareBefore)
        const a2 = shrink(after, fromAfter, spareAfter)
        return [
          ...b2,
          ...lp.slice(firstFridge, lastFridge + 1).map((p, i) => (i === 0 ? { ...p, hours: p.hours + x } : p)),
          ...a2,
        ]
      }
    }
    // Balls need a few hours in the fridge to actually cool down; a short stint isn't worth the trip.
    const minX = firstFridge < 0 ? 4 : 0.5
    if (build && xMax >= minX) {
      const make = build
      const f = (x: number) => ripe(withPhases(make(x)))
      const x = f(xMax) <= ACCEPT.max ? solveFor(f, 0, xMax, aim) : -1
      if (x >= minX) {
        // Round to quarter hours but keep the total (the start and the bake stay put).
        const raw = make(x).filter((p) => p.hours > 0.01)
        const next = raw.map((p) => ({ ...p, hours: quarter(p.hours) }))
        const drift = sumH(next) - oldTotal
        const fridgeAt = next.findIndex((p) => p.location === 'fridge')
        if (fridgeAt >= 0) next[fridgeAt] = { ...next[fridgeAt], hours: Math.max(0.25, next[fridgeAt].hours - drift) }
        accept('fridge', title, `${scheduleText(next)} (was ${scheduleText(phases)}). Same start and bake time.`, withPhases(next))
      }
    }
  }

  /* ---- Smaller / bigger preferments, same schedule ---- */
  if (r.method === 'indirect' && r.preferments.length && want('share')) {
    const base = r.preferments.map((p) => p.flourPct)
    const total = base.reduce((s, x) => s + x, 0)
    const withF = (f: number, round = false): Recipe => ({
      ...r,
      preferments: r.preferments.map((p, i) => ({
        ...p,
        flourPct: round ? Math.max(1, Math.round(base[i] * f)) : base[i] * f,
      })),
    })
    // Below ~10 % a preferment stops being worth making.
    const fMin = Math.max(...base.map((b) => 10 / b))
    const fMax = Math.min(100 / total, ...r.preferments.map((p, i) => (p.leavening === 'sourdough' ? 40 : 100) / base[i]))
    const [lo, hi] = need === 'over' ? [Math.min(1, fMin), 1] : [1, Math.max(1, fMax)]
    const f = (x: number) => ripe(withF(x))
    if (hi > lo && (need === 'over' ? f(lo) <= ACCEPT.max : f(hi) >= ACCEPT.min)) {
      const x = solveFor(f, lo, hi, aim)
      const next = withF(x, true)
      const one = r.preferments.length === 1
      const name = one ? r.preferments[0].name.toLowerCase() : 'preferments'
      const pcts = (rr: Recipe) => rr.preferments.map((p) => `${Math.round(p.flourPct)} %`).join(' + ')
      accept(
        'share',
        `${need === 'over' ? 'Smaller' : 'Bigger'} ${name}`,
        `${one ? `${r.preferments[0].name} at` : `${r.preferments.map((p) => p.name).join(' + ')} at`} ${pcts(next)} of the flour instead of ${pcts(r)}. Same schedule.`,
        next,
      )
    }
  }

  /* ---- Let the app work out the amounts ---- */
  if (want('auto')) {
    let next: Recipe | null = null
    let detail = ''
    if (r.method === 'direct' && r.directLeavening === 'sourdough' && r.starterMode === 'manual') {
      next = { ...r, starterMode: 'auto' }
      detail = `The app sizes the starter for your schedule instead of the ${Math.round(r.starterPct)} % you set.`
    } else if (r.final.extraYeastMode === 'manual' || (r.final.extraYeastMode === 'none' && need === 'under')) {
      next = { ...r, final: { ...r.final, extraYeastMode: 'auto' } }
      detail =
        r.method === 'indirect'
          ? r.final.extraYeastMode === 'none'
            ? 'Adds just enough yeast to the final dough to be ready on time; the preferment still brings its flavour.'
            : 'The app works out the extra yeast for your schedule instead of the amount you set.'
          : 'The app works out the yeast for your schedule instead of the amount you set.'
    }
    if (next) accept('auto', r.final.extraYeastMode === 'none' ? 'Add a little yeast' : 'Use the calculated amount', detail, next)
  }

  return out
}

/**
 * A biga that spends most of its time cold needs 2–3 % yeast to ripen, and all of it carries on into
 * the final dough, which then races. MasterBiga keeps a biga at ~1 %: hours at room temperature
 * first, then the fridge, in the same total time.
 */
export function bigaSplitFix(r: Recipe, prefId: string, opts: ComputeOptions): BalanceFix | null {
  const p = r.preferments.find((x) => x.id === prefId)
  if (!p || p.type !== 'biga' || p.amountMode !== 'auto') return null
  const total = sumH(p.phases)
  if (total < 8) return null
  const x = bigaRoomHours(r.kitchen.roomC, p.hydration, total)
  const phases = [makePhase('room', x), makePhase('fridge', total - x)]
  // Hours at room temperature want a cool start (MasterBiga: 18–20 °C), not a warm-closed cold biga's 25 °C.
  const targetTempC = Math.min(p.targetTempC, prefermentPreset('biga').targetTempC)
  const next: Recipe = { ...r, preferments: r.preferments.map((q) => (q.id === prefId ? { ...q, phases, targetTempC } : q)) }
  const before = computeRecipe(r, opts).stages.find((s) => s.id === prefId)!.leavening.freshPct
  const res = computeRecipe(next, opts)
  const after = res.stages.find((s) => s.id === prefId)!.leavening.freshPct
  if (after > 1.4 || after > before * 0.8) return null
  return {
    id: 'biga-split',
    title: 'Room first, then the fridge',
    detail: `${formatHours(x)} at room temperature, then ${formatHours(total - x)} in the fridge (was ${p.phases
      .filter((q) => q.hours > 0)
      .map((q) => `${formatHours(q.hours)} ${q.location === 'fridge' ? 'in the fridge' : q.location === 'room' ? 'at room' : `at ${q.customTempC} °C`}`)
      .join(' → ')}): about ${formatPct(after)} fresh yeast instead of ${formatPct(before)}.`,
    recipe: next,
    ripeness: res.stages.find((s) => s.id === 'final')!.ripeness,
  }
}
