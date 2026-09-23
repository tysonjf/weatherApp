/**
 * Live re-planning.
 *
 * Once a stage is mixed its yeast / starter is fixed, so a change of plans (or a dough running fast or
 * slow) can only be absorbed by time and temperature. Every option here is a small edit to the
 * recipe's *future* phases that keeps everything before "now" exactly where it happened; each is
 * checked by running the full model, and the continuous ones are solved by bisection.
 */
import type { LiveLog, Phase, Recipe, RecipeResult, StageResult } from './types'
import { computeRecipe, crossing, type ComputeOptions } from './compute'
import { makePhase } from './phases'
import { yeastFromFresh } from './yeastTypes'
import { formatTemp } from './units'

const H = 3600000
const MIN_PHASE_H = 0.25
/** Time cold balls get at room temperature before the bake when the dough is held cold. */
const TEMPER_H = 1.5

export const emptyLive = (): LiveLog => ({ mixed: {}, rises: [] })

interface Span {
  stageId: string
  /** Index into the stage's original phase array. */
  index: number
  startH: number
  endH: number
}

/** Phase spans on the bake-relative clock, exactly as the model lays them out. */
export function phaseSpans(r: Recipe): Span[] {
  const spans: Span[] = []
  const mixH = Math.max(0, r.final.mixMinutes) / 60
  const finalH = r.final.phases.reduce((s, p) => s + Math.max(0, p.hours), 0)
  const finalStart = -(finalH + mixH)
  if (r.method === 'indirect') {
    for (const p of r.preferments) {
      let t = finalStart - p.phases.reduce((s, x) => s + Math.max(0, x.hours), 0)
      p.phases.forEach((ph, index) => {
        if (ph.hours <= 0) return
        spans.push({ stageId: p.id, index, startH: t, endH: t + ph.hours })
        t += ph.hours
      })
    }
  }
  let t = finalStart + mixH
  r.final.phases.forEach((ph, index) => {
    if (ph.hours <= 0) return
    spans.push({ stageId: 'final', index, startH: t, endH: t + ph.hours })
    t += ph.hours
  })
  return spans
}

const finalStartH = (r: Recipe) =>
  -(r.final.phases.reduce((s, p) => s + Math.max(0, p.hours), 0) + Math.max(0, r.final.mixMinutes) / 60)

function stagePhases(r: Recipe, stageId: string): Phase[] {
  return stageId === 'final' ? r.final.phases : (r.preferments.find((p) => p.id === stageId)?.phases ?? [])
}

function withStagePhases(r: Recipe, stageId: string, phases: Phase[]): Recipe {
  if (stageId === 'final') return { ...r, final: { ...r.final, phases } }
  return { ...r, preferments: r.preferments.map((p) => (p.id === stageId ? { ...p, phases } : p)) }
}

/** Adds (or removes) hours from a stage's phases, starting at `index` and cascading forward when shrinking. */
function adjustFrom(phases: Phase[], index: number, deltaH: number): Phase[] {
  const out = phases.map((p) => ({ ...p }))
  if (deltaH >= 0) {
    out[index].hours += deltaH
    return out
  }
  let left = -deltaH
  for (let i = index; i < out.length && left > 1e-9; i++) {
    const take = Math.min(left, Math.max(0, out[i].hours - (i === out.length - 1 ? MIN_PHASE_H : 0)))
    out[i].hours -= take
    left -= take
  }
  return out
}

/** Adds hours to the end of a stage (its last phase); negative values shrink from the end backwards. */
function adjustEnd(phases: Phase[], deltaH: number): Phase[] {
  const out = phases.map((p) => ({ ...p }))
  const live = out.map((p, i) => (p.hours > 0 ? i : -1)).filter((i) => i >= 0)
  if (!live.length) return out
  if (deltaH >= 0) {
    out[live[live.length - 1]].hours += deltaH
    return out
  }
  let left = -deltaH
  for (let k = live.length - 1; k >= 0 && left > 1e-9; k--) {
    const i = live[k]
    const take = Math.min(left, Math.max(0, out[i].hours - MIN_PHASE_H))
    out[i].hours -= take
    left -= take
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Recording what happened                                             */
/* ------------------------------------------------------------------ */

/**
 * Records that a stage was mixed at `atMs` (optionally at a measured dough temperature). Its leavening
 * is locked at what the plan asked for, and the schedule is stretched or squeezed so its start sits
 * where it really happened while everything after keeps its clock time.
 */
export function markMixed(r: Recipe, res: RecipeResult, stageId: string, atMs: number, measuredC: number | null, bakeMs: number): Recipe {
  const stage = res.stages.find((s) => s.id === stageId)
  if (!stage) return r
  // "Mixed" means kneading is done and fermentation starts.
  const plannedH = stageId === 'final' ? stage.startH + Math.max(0, r.final.mixMinutes) / 60 : stage.startH
  const lateH = (atMs - (bakeMs + plannedH * H)) / H
  let next: Recipe = { ...r, live: { ...(r.live ?? emptyLive()), mixed: { ...(r.live?.mixed ?? {}), [stageId]: atMs } } }
  const lockPref = (rr: Recipe, id: string): Recipe => {
    const st = res.stages.find((s) => s.id === id)
    if (!st) return rr
    return {
      ...rr,
      preferments: rr.preferments.map((p) =>
        p.id !== id || p.amountMode === 'manual'
          ? p
          : {
              ...p,
              amountMode: 'manual',
              manualPct: p.leavening === 'yeast' ? yeastFromFresh(st.leavening.freshPct, rr.yeastType) : st.leavening.starterPct,
            },
      ),
    }
  }
  if (stageId === 'final') {
    for (const p of next.preferments) next = lockPref(next, p.id)
    const f = next.final
    const lockedFinal =
      next.method === 'direct' && next.directLeavening === 'sourdough'
        ? { ...next, starterMode: 'manual' as const, starterPct: stage.leavening.starterPct, final: { ...f, measuredMixC: measuredC } }
        : {
            ...next,
            final: {
              ...f,
              extraYeastMode: stage.leavening.freshPct > 0 ? ('manual' as const) : f.extraYeastMode === 'auto' ? ('none' as const) : f.extraYeastMode,
              extraYeastPct: stage.leavening.freshPct > 0 ? stage.leavening.typePct : f.extraYeastPct,
              measuredMixC: measuredC,
            },
          }
    next = lockedFinal
    if (Math.abs(lateH) > 1 / 60) {
      // The final dough's first phase absorbs the difference; mixed preferments waited that much longer (or less).
      next = withStagePhases(next, 'final', adjustFrom(next.final.phases, firstLive(next.final.phases), -lateH))
      for (const p of next.preferments)
        if (next.live?.mixed[p.id] !== undefined) next = withStagePhases(next, p.id, adjustEnd(p.phases, lateH))
    }
  } else {
    next = lockPref(next, stageId)
    next = {
      ...next,
      preferments: next.preferments.map((p) => (p.id === stageId ? { ...p, measuredMixC: measuredC } : p)),
    }
    if (Math.abs(lateH) > 1 / 60) {
      const phases = stagePhases(next, stageId)
      next = withStagePhases(next, stageId, adjustFrom(phases, firstLive(phases), -lateH))
    }
  }
  return next
}

const firstLive = (phases: Phase[]) => Math.max(0, phases.findIndex((p) => p.hours > 0))

/** Undoes markMixed for a stage: the amounts go back to automatic and the measurements are dropped. */
export function unmarkMixed(r: Recipe, stageId: string): Recipe {
  const mixed = { ...(r.live?.mixed ?? {}) }
  delete mixed[stageId]
  const live: LiveLog = { mixed, rises: stageId === 'final' ? [] : (r.live?.rises ?? []) }
  if (stageId === 'final')
    return {
      ...r,
      live,
      starterMode: r.method === 'direct' && r.directLeavening === 'sourdough' ? 'auto' : r.starterMode,
      final: {
        ...r.final,
        extraYeastMode: r.final.extraYeastMode === 'manual' || r.final.extraYeastMode === 'none' ? 'auto' : r.final.extraYeastMode,
        measuredMixC: null,
        activity: 1,
      },
    }
  return {
    ...r,
    live,
    preferments: r.preferments.map((p) => (p.id === stageId ? { ...p, amountMode: 'auto', measuredMixC: null, activity: 1 } : p)),
  }
}

/** Rise of the dough (%) expected at a given ripeness: the model's end point is a doubling, and early rise is exponential. */
export const riseForRipeness = (ripeness: number, proofTarget: number) => (Math.pow(2, Math.max(0, ripeness * proofTarget)) - 1) * 100
export const ripenessForRise = (risePct: number, proofTarget: number) => Math.log2(1 + Math.max(0, risePct) / 100) / proofTarget

export function ripenessAt(stage: StageResult, tH: number): number {
  const c = stage.curve
  if (!c.length) return 0
  if (tH <= c[0].t) return c[0].ripeness
  for (let i = 1; i < c.length; i++) {
    if (c[i].t >= tH) {
      const f = (tH - c[i - 1].t) / Math.max(1e-9, c[i].t - c[i - 1].t)
      return c[i - 1].ripeness + f * (c[i].ripeness - c[i - 1].ripeness)
    }
  }
  return c[c.length - 1].ripeness
}

/**
 * A sample-jar reading of the final dough sets how fast this dough really is compared with the model.
 * Returns the updated recipe and how reliable the reading is (early readings are noisy).
 */
export function applyRiseReading(r: Recipe, res: RecipeResult, risePct: number, atMs: number, bakeMs: number) {
  const f = res.stages.find((s) => s.id === 'final')!
  const tH = (atMs - bakeMs) / H
  const current = r.final.activity ?? 1
  const modelled = ripenessAt(f, tH) / current
  const observed = ripenessForRise(risePct, Math.max(0.5, r.final.proofTarget || 1))
  // Early on a few millimetres in the jar swing the ratio wildly: ignore very early readings and
  // only half-trust readings before about a third of the way.
  const raw = Math.min(2, Math.max(0.5, observed / Math.max(1e-6, modelled)))
  const weight = modelled < 0.15 ? 0 : modelled < 0.35 ? 0.5 : 1
  const activity = current * Math.pow(raw, weight)
  const next: Recipe = {
    ...r,
    final: { ...r.final, activity },
    live: { ...(r.live ?? emptyLive()), rises: [...(r.live?.rises ?? []), { at: atMs, risePct }] },
  }
  return { recipe: next, activity, reliable: weight === 1, ignored: weight === 0 }
}

/* ------------------------------------------------------------------ */
/* Re-planning                                                         */
/* ------------------------------------------------------------------ */

export interface ReplanOption {
  id: 'keep' | 'shift' | 'hold' | 'bake-when-ready'
  title: string
  detail: string
  recipe: Recipe
  /** Ripeness of the active stage at its end under this option. */
  ripeness: number
  /** Hold temperature, when the option holds the dough at one temperature. */
  holdC?: number
  /** Hours the next step moves (positive = later). */
  shiftH?: number
  /** When the next step now happens. */
  nextStepAtMs?: number
  /** New bake time for 'bake-when-ready'. */
  bakeAtMs?: number
}

export interface ReplanResult {
  stageId: string
  stageTitle: string
  /** Ripeness of the active stage right now. */
  ripenessNow: number
  options: ReplanOption[]
}

type Opts = Omit<ComputeOptions, 'bakeAtMs'>

const bakeOf = (r: Recipe) => (r.bakeAt ? Date.parse(r.bakeAt) : NaN)

function evaluate(r: Recipe, opts: Opts, stageId: string) {
  const res = computeRecipe(r, { ...opts, bakeAtMs: bakeOf(r) })
  return { res, ripeness: res.stages.find((s) => s.id === stageId)?.ripeness ?? NaN }
}

/** The stage that is fermenting right now (mixed and not yet finished). */
export function activeStage(r: Recipe, nowH: number): string | null {
  const mixed = r.live?.mixed ?? {}
  if (mixed.final !== undefined) return 'final'
  const fs = finalStartH(r)
  for (const p of r.preferments) if (mixed[p.id] !== undefined && nowH < fs) return p.id
  return null
}

/**
 * Moves the future by `deltaH` at "now" so that nothing that already happened moves: stages that are
 * fermenting absorb the time in their current phase, the bake (and everything after now) shifts.
 */
function insertTime(r: Recipe, nowH: number, deltaH: number, where: 'current' | 'last', stageId: string): Recipe {
  const spans = phaseSpans(r)
  let next: Recipe = { ...r, bakeAt: new Date(bakeOf(r) + deltaH * H).toISOString() }
  const fs = finalStartH(r)
  const started = (id: string) => r.live?.mixed[id] !== undefined
  // Mixed preferments that are still fermenting end at the final mix, which moves with the bake.
  for (const p of r.preferments) {
    if (!started(p.id) || nowH >= fs) continue
    if (p.id === stageId && where === 'current') {
      const cur = spans.find((s) => s.stageId === p.id && nowH >= s.startH && nowH < s.endH)
      next = withStagePhases(next, p.id, cur ? adjustFrom(p.phases, cur.index, deltaH) : adjustEnd(p.phases, deltaH))
    } else next = withStagePhases(next, p.id, adjustEnd(p.phases, deltaH))
  }
  if (started('final') || stageId === 'final') {
    const cur = spans.find((s) => s.stageId === 'final' && nowH >= s.startH && nowH < s.endH)
    const phases = next.final.phases
    next = withStagePhases(
      next,
      'final',
      where === 'current' && cur ? adjustFrom(phases, cur.index, deltaH) : adjustEnd(phases, deltaH),
    )
  }
  return next
}

/**
 * Sets every future phase of a stage to a steady temperature (splitting the current phase at now).
 * Cold-held final dough keeps a last stretch at room temperature so the balls can warm up.
 */
function holdAt(r: Recipe, nowH: number, stageId: string, holdC: number): Recipe {
  const spans = phaseSpans(r).filter((s) => s.stageId === stageId)
  const phases = stagePhases(r, stageId)
  const endH = spans.length ? spans[spans.length - 1].endH : 0
  const temperH = stageId === 'final' && holdC < 15 ? Math.min(TEMPER_H, Math.max(0, endH - nowH - MIN_PHASE_H)) : 0
  const holdUntil = endH - temperH
  const out: Phase[] = []
  phases.forEach((ph, index) => {
    const sp = spans.find((x) => x.index === index)
    if (!sp || sp.endH <= nowH) {
      out.push(ph)
      return
    }
    const from = Math.max(sp.startH, nowH)
    if (sp.startH < nowH) out.push({ ...ph, hours: nowH - sp.startH })
    const held = Math.max(0, Math.min(sp.endH, holdUntil) - from)
    const room = sp.endH - from - held
    if (held > 0) out.push({ ...makePhase('custom', held, ph.stage, holdC) })
    if (room > 0) out.push({ ...makePhase('room', room, ph.stage) })
  })
  return withStagePhases(r, stageId, out)
}

/** Moves the boundary after the current phase (the next step) by `shiftH`, keeping the stage's end fixed. */
function shiftNext(r: Recipe, nowH: number, stageId: string, shiftH: number): Recipe | null {
  const spans = phaseSpans(r).filter((s) => s.stageId === stageId)
  const cur = spans.findIndex((s) => nowH >= s.startH && nowH < s.endH)
  if (cur < 0 || cur === spans.length - 1) return null
  const a = spans[cur]
  const b = spans[cur + 1]
  const phases = stagePhases(r, stageId).map((p) => ({ ...p }))
  const newA = phases[a.index].hours + shiftH
  const newB = phases[b.index].hours - shiftH
  if (a.startH + newA < nowH + 1e-6 || newB < MIN_PHASE_H - 1e-9) return null
  phases[a.index].hours = newA
  phases[b.index].hours = newB
  return withStagePhases(r, stageId, phases)
}

function bisect(f: (x: number) => number, lo: number, hi: number, iters = 28): number | null {
  let flo = f(lo)
  const fhi = f(hi)
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if (fm * flo > 0) {
      lo = mid
      flo = fm
    } else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Options to get the fermenting stage ripe at the (possibly new) bake time.
 * `targetBakeMs` defaults to the current bake time ("the dough is running early/late").
 * When nothing within practical limits lands exactly on 100 %, the closest option is offered instead.
 */
export function replan(r: Recipe, opts: Opts, nowMs: number, targetBakeMs?: number): ReplanResult | null {
  const bakeMs = bakeOf(r)
  if (!Number.isFinite(bakeMs)) return null
  const nowH = (nowMs - bakeMs) / H
  const stageId = activeStage(r, nowH)
  if (!stageId) return null
  const u = opts.tempUnit ?? 'C'
  const base = evaluate(r, opts, stageId)
  const stage = base.res.stages.find((s) => s.id === stageId)!
  const deltaH = targetBakeMs === undefined ? 0 : (targetBakeMs - bakeMs) / H
  const moved = Math.abs(deltaH) > 1e-6
  const options: ReplanOption[] = []
  const endName = stageId === 'final' ? 'the bake' : 'the final mix'
  // 1. Keep the plan: extra (or less) time goes to the last step.
  const kept = moved ? insertTime(r, nowH, deltaH, 'last', stageId) : r
  const keptEval = moved ? evaluate(kept, opts, stageId) : base
  const keptMiss = Math.abs(keptEval.ripeness - 1)
  options.push({
    id: 'keep',
    title: moved ? 'Keep the steps, bake at the new time' : 'Carry on as planned',
    detail: `Ripeness at ${endName}: ${Math.round(keptEval.ripeness * 100)} %.`,
    recipe: kept,
    ripeness: keptEval.ripeness,
  })
  // Already on time: nothing to fix.
  if (keptMiss < 0.03) return { stageId, stageTitle: stage.title, ripenessNow: ripenessAt(stage, nowH), options }
  // Worth offering only if it gets meaningfully closer to 100 % than carrying on.
  const helps = (ripe: number) => Math.abs(ripe - 1) < 0.03 || Math.abs(ripe - 1) < keptMiss - 0.04
  // Every adjustment works on the plan with the new bake time.
  const nowK = (nowMs - bakeOf(kept)) / H

  // 2. Move the next step (e.g. into or out of the fridge earlier/later).
  const spans = phaseSpans(kept).filter((s) => s.stageId === stageId)
  const curIdx = spans.findIndex((s) => nowK >= s.startH && nowK < s.endH)
  const cur = spans[curIdx]
  const nextSpan = curIdx >= 0 ? spans[curIdx + 1] : undefined
  if (cur && nextSpan) {
    const phasesK = stagePhases(kept, stageId)
    // Balls coming out of the fridge need time to warm up before they can be stretched.
    const warmUp =
      stageId === 'final' && phasesK[cur.index].location === 'fridge' && phasesK[nextSpan.index].location !== 'fridge' && nextSpan.index === spans[spans.length - 1].index
        ? TEMPER_H
        : MIN_PHASE_H
    const lo = -(cur.endH - nowK) + 1e-3
    const hi = nextSpan.endH - nextSpan.startH - warmUp
    const ripeAt = (sh: number) => {
      const x = shiftNext(kept, nowK, stageId, sh)
      return x ? evaluate(x, opts, stageId).ripeness : NaN
    }
    let sh = hi > lo ? bisect((x) => ripeAt(x) - 1, lo, hi) : null
    if (sh === null && hi > lo) {
      const a = ripeAt(lo)
      const b = ripeAt(hi)
      sh = Math.abs(a - 1) < Math.abs(b - 1) ? lo : hi
    }
    if (sh !== null) {
      sh = Math.max(lo, Math.min(hi, Math.round(sh * 12) / 12))
      const xr = Math.abs(sh) >= 1 / 12 ? shiftNext(kept, nowK, stageId, sh) : null
      if (xr) {
        const ripe = evaluate(xr, opts, stageId).ripeness
        if (helps(ripe)) {
          const nextAt = bakeOf(xr) + phaseSpans(xr).filter((s) => s.stageId === stageId)[curIdx + 1].startH * H
          options.push({
            id: 'shift',
            title: `Do the next step ${fmtShift(Math.abs(sh))} ${sh > 0 ? 'later' : 'earlier'}`,
            detail:
              Math.abs(ripe - 1) < 0.03
                ? `Then it is ripe right at ${endName}.`
                : `The closest you can get: ${Math.round(ripe * 100)} % at ${endName}.`,
            recipe: xr,
            ripeness: ripe,
            shiftH: sh,
            nextStepAtMs: nextAt,
          })
        }
      }
    }
  }

  // 3. Hold at one temperature until the end of the stage (between the fridge and a warm spot).
  const coldest = Math.max(1, r.kitchen.fridgeC)
  const ripeHeld = (c: number) => evaluate(holdAt(kept, nowK, stageId, c), opts, stageId).ripeness
  const c = bisect((x) => ripeHeld(x) - 1, coldest, 30, 22)
  if (c !== null) {
    const holdC = Math.round(c * 2) / 2
    const xr = holdAt(kept, nowK, stageId, holdC)
    const ripe = evaluate(xr, opts, stageId).ripeness
    if (helps(ripe))
      options.push({
        id: 'hold',
        title: `Keep it at about ${formatTemp(holdC, u, 0)}`,
        detail: `${holdPlace(holdC)} until ${endName}${stageId === 'final' && holdC < 15 ? ', then let the balls warm up at room temperature' : ''}.`,
        recipe: xr,
        ripeness: ripe,
        holdC,
      })
  }

  // 4. Bake when it's ready: only once it is in its last spot (not straight from the fridge) and within reason.
  if (stageId === 'final') {
    const kres = keptEval.res
    const kf = kres.stages.find((s) => s.id === 'final')!
    const lastStart = kf.phases.length ? kf.phases[kf.phases.length - 1].startH : kf.startH
    const at = crossing([...kf.curve, ...kres.window.after.slice(1)], 1)
    const newBake = bakeOf(kept)
    if (at !== null && at >= lastStart && Math.abs(at) > 1 / 12 && Math.abs(at) <= 8 && newBake + at * H > nowMs + 0.25 * H) {
      const xr = insertTime(kept, (nowMs - newBake) / H, at, 'last', stageId)
      options.push({
        id: 'bake-when-ready',
        title: `Bake ${fmtShift(Math.abs(at))} ${at > 0 ? 'later' : 'earlier'}`,
        detail: 'That is when it reaches its planned rise.',
        recipe: xr,
        ripeness: evaluate(xr, opts, stageId).ripeness,
        bakeAtMs: newBake + at * H,
      })
    }
  }

  return { stageId, stageTitle: stage.title, ripenessNow: ripenessAt(stage, nowH), options }
}

function fmtShift(h: number): string {
  const m = Math.round(h * 60)
  if (m < 60) return `${m} min`
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${hh} h ${mm} min` : `${hh} h`
}

/** Where to find a temperature at home. */
export function holdPlace(c: number): string {
  if (c <= 6) return 'In the fridge'
  if (c <= 10) return 'In the fridge door or a cellar'
  if (c <= 15) return 'In a wine fridge, cellar or cool garage'
  if (c <= 19) return 'In a cool spot'
  if (c <= 25) return 'At room temperature'
  if (c <= 30) return 'In a warm spot: the oven with just the light on, or a proofing box'
  return 'In a proofing box'
}
