/**
 * Learning from your bakes.
 *
 * Every journal entry says how the dough behaved against the plan — ideally "it was ready N hours
 * later than planned", otherwise just under/over-proofed. The model turns that into the yeast
 * calibration (or starter speed) that would have made the plan right, relative to the one in use at
 * the time. A recency-weighted geometric mean of those becomes the suggestion.
 */
import { B, rateAt, sdDoublingHours } from './fermentation'
import type { RecipeResult, Recipe } from './types'

export type ProofOutcome = 'under' | 'right' | 'over'

export interface BakeSnapshot {
  leavening: 'yeast' | 'sourdough'
  /** Final dough clocks in the plan. */
  eqHours21: number
  sdDoublings: number
  /** Temperature around the dough at the end of the plan (°C). */
  lastEnvC: number
  /** Calibrations in use when it was planned. */
  yeastScale: number
  starterSpeed: number
  hydration: number
  saltPct: number
  totalHours: number
  roomC: number
  yeastPct: number
  method: string
}

export interface JournalEntry {
  id: string
  recipeId: string
  recipeName: string
  styleId: string
  bakedAt: number
  createdAt: number
  /** 1–5 */
  rating: number
  proof: ProofOutcome
  /** Hours the dough was ready after (+) or before (−) the planned bake; null if not noted. */
  readyOffsetH: number | null
  notes: string
  plan: BakeSnapshot
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** What to remember about a plan so a later bake report can be turned into a calibration. */
export function snapshotOf(r: Recipe, res: RecipeResult, cal: { yeastScale: number; starterSpeed: number }, method: string): BakeSnapshot {
  const f = res.stages.find((s) => s.id === 'final')!
  const last = f.phases[f.phases.length - 1]
  const sourdough =
    (r.method === 'direct' && r.directLeavening === 'sourdough') ||
    (r.method === 'indirect' && r.preferments.some((p) => p.leavening === 'sourdough') && f.leavening.freshPct === 0)
  return {
    leavening: sourdough ? 'sourdough' : 'yeast',
    eqHours21: f.clocks.eqHours21,
    sdDoublings: f.clocks.sdDoublings,
    lastEnvC: last ? last.tempC : r.kitchen.roomC,
    yeastScale: cal.yeastScale,
    starterSpeed: cal.starterSpeed,
    hydration: r.hydration,
    saltPct: r.saltPct,
    totalHours: res.totalHours,
    roomC: r.kitchen.roomC,
    yeastPct: f.leavening.typePct,
    method,
  }
}

/** Yeast calibration this bake implies (absolute), or null for sourdough bakes. */
export function impliedYeastScale(e: JournalEntry): number | null {
  const p = e.plan
  if (p.leavening !== 'yeast') return null
  let rel: number
  if (e.readyOffsetH !== null && p.eqHours21 > 0) {
    // Ready later = the dough needed more fermentation than planned = more yeast next time.
    const actual = Math.max(0.3 * p.eqHours21, p.eqHours21 + e.readyOffsetH * rateAt(p.lastEnvC))
    rel = Math.pow(actual / p.eqHours21, 1 / B)
  } else rel = e.proof === 'under' ? 1.15 : e.proof === 'over' ? 0.87 : 1
  return clamp(p.yeastScale * rel, 0.4, 2.5)
}

/** Starter speed this bake implies (absolute), or null for yeasted bakes. */
export function impliedStarterSpeed(e: JournalEntry): number | null {
  const p = e.plan
  if (p.leavening !== 'sourdough') return null
  let rel: number
  if (e.readyOffsetH !== null && p.sdDoublings > 0) {
    // It took more (model) doublings than planned to get there: the starter is slower.
    const needed = Math.max(0.3 * p.sdDoublings, p.sdDoublings + e.readyOffsetH / sdDoublingHours(p.lastEnvC))
    rel = p.sdDoublings / needed
  } else rel = e.proof === 'under' ? 0.87 : e.proof === 'over' ? 1.15 : 1
  return clamp(p.starterSpeed * rel, 0.3, 3)
}

export interface Suggestion {
  value: number
  /** Bakes it is based on. */
  n: number
}

function weighted(values: number[]): Suggestion | null {
  if (!values.length) return null
  let lw = 0
  let w = 0
  values.forEach((v, i) => {
    const wi = Math.pow(0.75, i)
    lw += wi * Math.log(v)
    w += wi
  })
  return { value: Math.exp(lw / w), n: values.length }
}

/** Suggested calibrations from the most recent bakes (newest first). */
export function suggestCalibration(entries: JournalEntry[]): { yeast: Suggestion | null; starter: Suggestion | null } {
  const recent = [...entries].sort((a, b) => b.bakedAt - a.bakedAt)
  const ys = recent.map(impliedYeastScale).filter((v): v is number => v !== null).slice(0, 6)
  const ss = recent.map(impliedStarterSpeed).filter((v): v is number => v !== null).slice(0, 6)
  return { yeast: weighted(ys), starter: weighted(ss) }
}
