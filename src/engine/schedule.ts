/**
 * Fitting a plan around the baker's day.
 *
 * Hands-on steps (feeding, mixing, balling, fridge moves) should not land while you sleep or work. The
 * bake time is fixed, so a step can only move by changing how long a phase *after* it lasts: a longer
 * fridge phase moves everything before it earlier, a shorter one later. Cold phases are cheap to stretch
 * (the yeast is re-solved for the new schedule); warm phases only a little.
 */
import type { Phase, Recipe, RecipeResult, TimelineEvent, TimelineKind } from './types'
import { computeRecipe, type ComputeOptions } from './compute'

const H = 3600000

export interface DayPlan {
  /** Sleep window, local hours (may wrap past midnight, e.g. 23 → 7). Equal values = none. */
  sleepFrom: number
  sleepTo: number
  /** Busy block on weekdays (Mon–Fri). */
  workOn: boolean
  workFrom: number
  workTo: number
}

export const DEFAULT_DAY: DayPlan = { sleepFrom: 23, sleepTo: 7, workOn: false, workFrom: 9, workTo: 17.5 }

/** Timeline steps that need you in the kitchen and can be moved. */
export const HANDS_ON: TimelineKind[] = ['feed', 'build', 'autolyse', 'mix', 'fold', 'ball', 'move', 'temper']

export interface Block {
  start: number
  end: number
  kind: 'sleep' | 'work'
}

const at = (day: Date, hours: number) => {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  return d.getTime() + hours * H
}

/** Blocked intervals (epoch ms) overlapping [fromMs, toMs]. */
export function blocks(plan: DayPlan, fromMs: number, toMs: number): Block[] {
  const out: Block[] = []
  const first = new Date(fromMs - 36 * H)
  first.setHours(12, 0, 0, 0)
  for (let d = new Date(first); d.getTime() <= toMs + 36 * H; d.setDate(d.getDate() + 1)) {
    if (plan.sleepFrom !== plan.sleepTo) {
      const start = at(d, plan.sleepFrom)
      const end = plan.sleepTo > plan.sleepFrom ? at(d, plan.sleepTo) : at(d, plan.sleepTo + 24)
      if (end > fromMs && start < toMs) out.push({ start, end, kind: 'sleep' })
    }
    const wd = d.getDay()
    if (plan.workOn && wd >= 1 && wd <= 5 && plan.workTo > plan.workFrom) {
      const start = at(d, plan.workFrom)
      const end = at(d, plan.workTo)
      if (end > fromMs && start < toMs) out.push({ start, end, kind: 'work' })
    }
  }
  return out
}

export interface Clash {
  event: TimelineEvent
  atMs: number
  block: Block
}

/** Hands-on steps that land in a blocked window. */
export function clashes(events: TimelineEvent[], bakeMs: number, plan: DayPlan): Clash[] {
  if (!events.length) return []
  const times = events.map((e) => bakeMs + e.atH * H)
  const bl = blocks(plan, Math.min(...times), Math.max(...times))
  const out: Clash[] = []
  events.forEach((event, i) => {
    if (!HANDS_ON.includes(event.kind)) return
    const t = times[i]
    const block = bl.find((b) => t >= b.start && t < b.end)
    if (block) out.push({ event, atMs: t, block })
  })
  return out
}

/* ------------------------------------------------------------------ */

interface Flex {
  min: number
  max: number
  /** Cost per hour of change. */
  cost: number
}

function flexOf(ph: Phase, isTemper: boolean): Flex {
  const h = ph.hours
  const cold = ph.location === 'fridge' || (ph.location === 'custom' && ph.customTempC < 15)
  if (cold) return { min: Math.max(Math.min(h, 4), h * 0.5), max: Math.min(120, Math.max(h * 2, h + 12)), cost: ph.location === 'fridge' ? 1 : 1.5 }
  return { min: Math.max(isTemper ? 1 : 0.5, h * 0.7), max: Math.max(h * 1.35, h + 0.75), cost: 3 }
}

const liveIdx = (phases: Phase[]) => phases.map((p, i) => (p.hours > 0 ? i : -1)).filter((i) => i >= 0)

/** Which phases (stage, original index) move a timeline step when their length changes. */
function moversOf(r: Recipe, e: TimelineEvent): { stageId: string; index: number }[] {
  const final = liveIdx(r.final.phases)
  const all = (stageId: string, idx: number[]) => idx.map((index) => ({ stageId, index }))
  if (e.id === 'final-mix' || e.id === 'starter-feed' || e.id === 'autolyse' || e.id.startsWith('fold-')) return all('final', final)
  const m = /^(ball|final-move)-(\d+)$/.exec(e.id)
  if (m) return all('final', final.slice(Number(m[2])))
  for (const p of r.preferments) {
    const idx = liveIdx(p.phases)
    if (e.id === `${p.id}-build` || e.id === `${p.id}-feed`) return all(p.id, idx)
    const pm = new RegExp(`^${p.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-move-(\\d+)$`).exec(e.id)
    if (pm) return all(p.id, idx.slice(Number(pm[1])))
  }
  return []
}

function withHours(r: Recipe, stageId: string, index: number, hours: number): Recipe {
  if (stageId === 'final') return { ...r, final: { ...r.final, phases: r.final.phases.map((p, i) => (i === index ? { ...p, hours } : p)) } }
  return {
    ...r,
    preferments: r.preferments.map((p) => (p.id === stageId ? { ...p, phases: p.phases.map((x, i) => (i === index ? { ...x, hours } : x)) } : p)),
  }
}

const phaseOf = (r: Recipe, stageId: string, index: number) =>
  stageId === 'final' ? r.final.phases[index] : r.preferments.find((p) => p.id === stageId)!.phases[index]

export interface FitChange {
  title: string
  fromMs: number
  toMs: number
}

export interface FitResult {
  recipe: Recipe
  result: RecipeResult
  /** Steps that moved (the first action of each moved stage and every clash that was solved). */
  changes: FitChange[]
  /** Clashes that could not be solved within sensible limits. */
  remaining: Clash[]
}

/** Phase index (original array) whose start a timeline step marks, if it is a move inside a stage. */
function startsPhase(r: Recipe, e: TimelineEvent): { stageId: string; index: number } | null {
  const m = /^(ball|final-move)-(\d+)$/.exec(e.id)
  if (m) {
    const idx = liveIdx(r.final.phases)
    const i = Number(m[2])
    return i > 0 && idx[i] !== undefined ? { stageId: 'final', index: idx[i] } : null
  }
  for (const p of r.preferments) {
    const pm = new RegExp(`^${p.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-move-(\\d+)$`).exec(e.id)
    if (pm) {
      const idx = liveIdx(p.phases)
      const i = Number(pm[1])
      return i > 0 && idx[i] !== undefined ? { stageId: p.id, index: idx[i] } : null
    }
  }
  return null
}

type Change = Map<string, { stageId: string; index: number; hours: number }>

/**
 * Stretches or squeezes phases (fridge first) so no hands-on step lands in a blocked window, keeping the
 * bake time. Each round tries, for every clashing step, stretching any phase after it (which moves that
 * step and everything before it) and moving just its own boundary (one phase longer, the next shorter),
 * over the whole sensible range. Moving steps is plain arithmetic; the winner is re-run through the full
 * model so yeast and temperatures follow.
 */
export function fitToDay(recipe: Recipe, opts: Omit<ComputeOptions, 'bakeAtMs'>, bakeMs: number, plan: DayPlan): FitResult {
  const run = (r: Recipe) => computeRecipe(r, { ...opts, bakeAtMs: bakeMs })
  let r = recipe
  let res = run(r)
  let cur = clashes(res.timeline, bakeMs, plan)
  const before = res.timeline
  const key = (s: string, i: number) => `${s}#${i}`
  const orig = new Map<string, number>()
  const note = (stageId: string, index: number) => {
    const k = key(stageId, index)
    if (!orig.has(k)) orig.set(k, phaseOf(recipe, stageId, index).hours)
    return orig.get(k)!
  }
  const lastFinal = liveIdx(r.final.phases).at(-1)
  const flexFor = (stageId: string, index: number) => {
    const o = note(stageId, index)
    const prevLoc = stageId === 'final' && index > 0 ? r.final.phases[index - 1]?.location : undefined
    return flexOf({ ...phaseOf(r, stageId, index), hours: o }, stageId === 'final' && index === lastFinal && prevLoc === 'fridge')
  }
  for (let iter = 0; iter < 10 && cur.length; iter++) {
    const events = res.timeline
    const times = events.map((e) => bakeMs + e.atH * H)
    const bl = blocks(plan, Math.min(...times) - 72 * H, Math.max(...times) + H)
    const moverSets = events.map((e) => moversOf(r, e).map((m) => key(m.stageId, m.index)))
    const clashCount = (ch: Change) => {
      let n = 0
      events.forEach((e, i) => {
        if (!HANDS_ON.includes(e.kind)) return
        let shift = 0
        for (const [k, c] of ch) if (moverSets[i].includes(k)) shift += c.hours - phaseOf(r, c.stageId, c.index).hours
        // A longer phase moves every step before it earlier.
        const t = times[i] - shift * H
        if (bl.some((b) => t >= b.start && t < b.end)) n++
      })
      return n
    }
    const cost = (ch: Change) => {
      let c = 0
      for (const [, x] of ch) c += Math.abs(x.hours - note(x.stageId, x.index)) * flexFor(x.stageId, x.index).cost
      return c
    }
    const pool: { ch: Change; score: number }[] = []
    const consider = (ch: Change) => {
      pool.push({ ch, score: clashCount(ch) * 1000 + cost(ch) })
    }
    for (const c of cur) {
      // Stretch one phase after the step.
      for (const m of moversOf(r, c.event)) {
        const f = flexFor(m.stageId, m.index)
        for (let h = Math.ceil(f.min * 4) / 4; h <= f.max + 1e-9; h += 0.25)
          consider(new Map([[key(m.stageId, m.index), { ...m, hours: h }]]))
      }
      // Move only this step: the phase before it longer, its own phase shorter (or the other way).
      const own = startsPhase(r, c.event)
      if (own) {
        const phases = own.stageId === 'final' ? r.final.phases : r.preferments.find((p) => p.id === own.stageId)!.phases
        const prevIdx = liveIdx(phases).filter((i) => i < own.index).at(-1)
        if (prevIdx !== undefined) {
          const fa = flexFor(own.stageId, prevIdx)
          const fb = flexFor(own.stageId, own.index)
          const ha = phases[prevIdx].hours
          const hb = phases[own.index].hours
          const lo = Math.max(fa.min - ha, hb - fb.max)
          const hi = Math.min(fa.max - ha, hb - fb.min)
          for (let sft = Math.ceil(lo * 4) / 4; sft <= hi + 1e-9; sft += 0.25)
            consider(
              new Map([
                [key(own.stageId, prevIdx), { stageId: own.stageId, index: prevIdx, hours: ha + sft }],
                [key(own.stageId, own.index), { stageId: own.stageId, index: own.index, hours: hb - sft }],
              ]),
            )
        }
      }
    }
    // The cheapest few go through the full model: a fix must not leave the dough badly over- or under-ripe.
    pool.sort((a, b) => a.score - b.score)
    let chosen: { r: Recipe; res: RecipeResult; score: number } | null = null
    for (const cand of pool.slice(0, 6)) {
      if (cand.score >= cur.length * 1000) break
      let x = r
      for (const [, c] of cand.ch) x = withHours(x, c.stageId, c.index, c.hours)
      const xres = run(x)
      const off = Math.abs((xres.stages.at(-1)?.ripeness ?? 1) - 1)
      const score = cand.score + Math.max(0, off - 0.05) * 2000
      if (!chosen || score < chosen.score) chosen = { r: x, res: xres, score }
    }
    if (!chosen || chosen.score >= cur.length * 1000 + Math.max(0, Math.abs((res.stages.at(-1)?.ripeness ?? 1) - 1) - 0.05) * 2000) break
    r = chosen.r
    res = chosen.res
    cur = clashes(res.timeline, bakeMs, plan)
  }
  // Report how the hands-on steps moved.
  const changes: FitChange[] = []
  for (const e of res.timeline) {
    if (!HANDS_ON.includes(e.kind)) continue
    const old = before.find((b) => b.id === e.id)
    if (old && Math.abs(old.atH - e.atH) > 1 / 60) changes.push({ title: e.title, fromMs: bakeMs + old.atH * H, toMs: bakeMs + e.atH * H })
  }
  return { recipe: r, result: res, changes, remaining: cur }
}
