import type { Recipe, YeastType } from './types'
import { yeastFromFresh } from './yeastTypes'

/** Leavening percentages decided by the fermentation model. */
export interface LeaveningPlan {
  prefs: Record<string, { yeastFreshPct: number; seedPct: number }>
  /** Extra commercial yeast in the final dough, fresh equivalent, % of TOTAL flour. */
  finalYeastFreshPct: number
  /** Direct sourdough: ripe starter weight as % of TOTAL flour. */
  directStarterPct: number
}

export interface PrefComposition {
  id: string
  /** Total flour in the preferment (including flour carried by the seed starter). */
  flour: number
  water: number
  /** Fresh flour / water you actually weigh out (excludes the seed starter's share). */
  freshFlour: number
  freshWater: number
  seed: number
  yeastFresh: number
  yeast: number
  salt: number
  honey: number
  total: number
}

export interface FinalComposition {
  flour: number
  water: number
  reserveWater: number
  salt: number
  oil: number
  sugar: number
  malt: number
  yeastFresh: number
  yeast: number
  starter: number
  starterFlour: number
  starterWater: number
  prefermentWeight: number
  total: number
}

export interface Composition {
  dough: number
  pieces: number
  pieceWeight: number
  totalFlour: number
  totalWater: number
  salt: number
  oil: number
  sugar: number
  malt: number
  honey: number
  yeastFresh: number
  yeast: number
  starter: number
  prefs: PrefComposition[]
  final: FinalComposition
  /** Problems such as preferments needing more water than the whole dough has. */
  issues: { kind: 'water' | 'flour' | 'salt'; excess: number; minHydration?: number }[]
}

export function panArea(r: Recipe): number {
  const s = r.sizing
  return s.panShape === 'round' ? Math.PI * (s.panDiameterCm / 2) ** 2 : s.panWidthCm * s.panLengthCm
}

export function pieceWeight(r: Recipe): number {
  return r.sizing.mode === 'pans' ? panArea(r) * r.sizing.thicknessFactor : r.sizing.ballWeight
}

const typePct = (freshPct: number, type: YeastType) => yeastFromFresh(freshPct, type)

export function computeComposition(r: Recipe, plan: LeaveningPlan): Composition {
  const pieces = Math.max(0, r.sizing.count)
  const pw = pieceWeight(r)
  const dough = pieces * pw * (1 + r.wastePct / 100)
  const prefs = r.method === 'indirect' ? r.preferments : []

  // Every ingredient as a percentage of total flour, so total flour = dough / (sum / 100).
  let sumPct = 100 + r.hydration + r.saltPct + r.oilPct + r.sugarPct + r.maltPct
  sumPct += typePct(plan.finalYeastFreshPct, r.yeastType)
  for (const p of prefs) {
    const lp = plan.prefs[p.id]
    const yPct = p.leavening === 'yeast' ? typePct(lp?.yeastFreshPct ?? 0, r.yeastType) : 0
    sumPct += (p.flourPct / 100) * (p.honeyPct + yPct)
  }
  const F = sumPct > 0 ? (dough * 100) / sumPct : 0
  const W = (F * r.hydration) / 100

  const prefComps: PrefComposition[] = prefs.map((p) => {
    const lp = plan.prefs[p.id] ?? { yeastFreshPct: 0, seedPct: 0 }
    const flour = (F * p.flourPct) / 100
    const water = (flour * p.hydration) / 100
    let freshFlour = flour
    let freshWater = water
    let seed = 0
    if (p.leavening === 'sourdough') {
      // seedPct is the ripe starter as % of the FRESH flour (1:5:5 → 20 %).
      const hs = p.seedHydration / 100
      const k = lp.seedPct / 100
      freshFlour = flour / (1 + k / (1 + hs))
      seed = freshFlour * k
      freshWater = water - (seed * hs) / (1 + hs)
    }
    const yeastFresh = p.leavening === 'yeast' ? (flour * lp.yeastFreshPct) / 100 : 0
    const yeast = p.leavening === 'yeast' ? yeastFromFresh(yeastFresh, r.yeastType) : 0
    const salt = (flour * p.saltPct) / 100
    const honey = (flour * p.honeyPct) / 100
    return {
      id: p.id,
      flour,
      water,
      freshFlour,
      freshWater,
      seed,
      yeastFresh,
      yeast,
      salt,
      honey,
      total: flour + water + yeast + salt + honey,
    }
  })

  const issues: Composition['issues'] = []
  const prefFlour = prefComps.reduce((s, p) => s + p.flour, 0)
  const prefWater = prefComps.reduce((s, p) => s + p.water, 0)
  const prefSalt = prefComps.reduce((s, p) => s + p.salt, 0)

  const hsDirect = r.starterHydration / 100
  const starter = r.method === 'direct' && r.directLeavening === 'sourdough' ? (F * plan.directStarterPct) / 100 : 0
  const starterFlour = starter / (1 + hsDirect)
  const starterWater = starter - starterFlour

  let finalFlour = F - prefFlour - starterFlour
  let finalWater = W - prefWater - starterWater
  let finalSalt = (F * r.saltPct) / 100 - prefSalt
  if (finalFlour < -0.01) issues.push({ kind: 'flour', excess: -finalFlour })
  if (finalWater < -0.01) {
    const neededWater = prefWater + starterWater
    issues.push({ kind: 'water', excess: -finalWater, minHydration: F > 0 ? (neededWater / F) * 100 : 0 })
  }
  if (finalSalt < -0.01) issues.push({ kind: 'salt', excess: -finalSalt })
  finalFlour = Math.max(0, finalFlour)
  finalWater = Math.max(0, finalWater)
  finalSalt = Math.max(0, finalSalt)

  const finalYeastFresh = (F * plan.finalYeastFreshPct) / 100
  const finalYeast = yeastFromFresh(finalYeastFresh, r.yeastType)
  const oil = (F * r.oilPct) / 100
  const sugar = (F * r.sugarPct) / 100
  const malt = (F * r.maltPct) / 100
  const reserveWater = (finalWater * Math.min(40, Math.max(0, r.final.reservePct))) / 100
  const prefermentWeight = prefComps.reduce((s, p) => s + p.total, 0)

  const final: FinalComposition = {
    flour: finalFlour,
    water: finalWater,
    reserveWater,
    salt: finalSalt,
    oil,
    sugar,
    malt,
    yeastFresh: finalYeastFresh,
    yeast: finalYeast,
    starter,
    starterFlour,
    starterWater,
    prefermentWeight,
    total: prefermentWeight + finalFlour + finalWater + finalSalt + oil + sugar + malt + finalYeast + starter,
  }

  const yeastFresh = finalYeastFresh + prefComps.reduce((s, p) => s + p.yeastFresh, 0)
  return {
    dough,
    pieces,
    pieceWeight: pw,
    totalFlour: F,
    totalWater: W,
    salt: (F * r.saltPct) / 100,
    oil,
    sugar,
    malt,
    honey: prefComps.reduce((s, p) => s + p.honey, 0),
    yeastFresh,
    yeast: yeastFromFresh(yeastFresh, r.yeastType),
    starter: starter + prefComps.reduce((s, p) => s + p.seed, 0),
    prefs: prefComps,
    final,
    issues,
  }
}
