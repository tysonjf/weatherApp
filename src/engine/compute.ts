import type {
  Advice,
  CurvePoint,
  IngredientLine,
  Phase,
  PrefermentSpec,
  Recipe,
  RecipeResult,
  ResolvedPhase,
  StageResult,
  WaterPlan,
} from './types'
import { computeComposition, pieceWeight, type Composition, type LeaveningPlan } from './composition'
import {
  C_FLOUR,
  C_OIL,
  C_SALT,
  C_SUGAR,
  classicWaterTemp,
  mixCp,
  solveWater,
  type ThermalMass,
} from './temperature'
import { phaseTempC, totalHours } from './phases'
import { mixerById } from './mixers'
import { flourById, ovenById, prefermentPreset, recommendedW, styleById } from './presets'
import {
  REF_C,
  bigaHoursFor,
  bigaYeastFor,
  doublingsForSeed,
  doublingsForStarter,
  doughMultiplier,
  eqHoursForYeast,
  rateAt,
  saltMultiplier,
  sdDoublingHours,
  seedForDoublings,
  simulate,
  starterForDoublings,
  yeastForEqHours,
  type SimResult,
  type SimSegment,
} from './fermentation'
import { YEAST_SHORT, yeastFromFresh, yeastToFresh } from './yeastTypes'
import { buildTimeline } from './timeline'
import { formatHours, formatPct, formatTemp, formatWeight, localizeTemps, type TempUnit } from './units'
import { hoursToReach } from './thermal'

export interface ComputeOptions {
  /** Calibrated mechanical rise for the recipe's mixer (from settings). */
  calibratedRiseC?: number
  tempUnit?: TempUnit
  /** Personal yeast calibration: >1 if doughs usually run slow, <1 if fast. */
  yeastScale?: number
}

/**
 * Share of a full fermentation that prefermented flour still needs in the final dough.
 * 1 = none credited: with Craig's end point this reproduces Italian practice (100 % biga at 1 %
 * yeast is ready ~3 h after mixing at 22 °C; 50 % biga ~5 h).
 */
export const PREFERMENTED_CREDIT = 1

/** Yeast needed and ripeness for a yeast-leavened preferment from its simulated clocks. */
function prefYeast(p: PrefermentSpec, sim: SimResult, manualFresh: number | null, scale: number) {
  if (p.type === 'biga') {
    const auto = bigaYeastFor(sim.bigaEq18, p.hydration, p.saltPct) * scale
    const y = manualFresh ?? auto
    return { y, ripeness: sim.bigaEq18 / bigaHoursFor(y / scale, p.hydration, p.saltPct) }
  }
  if (p.type === 'poolish') {
    const m = saltMultiplier(p.saltPct, p.hydration) * scale
    const auto = yeastForEqHours('poolish', sim.eqHours, m)
    const y = manualFresh ?? auto
    return { y, ripeness: sim.eqHours / eqHoursForYeast('poolish', y, m) }
  }
  const m = doughMultiplier({ hydration: p.hydration, saltPct: p.saltPct, oilPct: 0, sugarPct: p.honeyPct }) * scale
  const auto = yeastForEqHours('dough', sim.eqHours, m)
  const y = manualFresh ?? auto
  return { y, ripeness: sim.eqHours / eqHoursForYeast('dough', y, m) }
}

interface PrefState {
  spec: PrefermentSpec
  yeastFreshPct: number
  seedPct: number
  ripeness: number
  mixC: number
  endC: number
  eqH: number
  phases: ResolvedPhase[]
  water: WaterPlan | null
  curve: CurvePoint[]
}

export function computeRecipe(recipe: Recipe, opts: ComputeOptions = {}): RecipeResult {
  const r = recipe
  const u = opts.tempUnit ?? 'C'
  const scale = Math.min(3, Math.max(0.3, opts.yeastScale ?? 1))
  const k = r.kitchen
  const flourC = k.flourC ?? k.roomC
  const mixer = mixerById(k.mixerId)
  const mixerRise = k.mixerRiseC ?? opts.calibratedRiseC ?? mixer.riseC
  const prefRise = Math.max(0, Math.min(1.5, mixerRise * 0.3))
  const tempOf = (p: Phase) => phaseTempC(p, k)
  const prefs = r.method === 'indirect' ? r.preferments : []
  const advice: Advice[] = []
  const add = (a: Advice) => advice.push(a)

  // Pass 1: composition without yeast, just to know masses for the thermal model.
  const emptyPlan: LeaveningPlan = { prefs: {}, finalYeastFreshPct: 0, directStarterPct: 0 }
  for (const p of prefs) emptyPlan.prefs[p.id] = { yeastFreshPct: 0, seedPct: p.leavening === 'sourdough' ? 50 : 0 }
  const comp0 = computeComposition(r, emptyPlan)
  const pw = pieceWeight(r)

  const finalMixH = Math.max(0, r.final.mixMinutes) / 60
  const finalPhases = r.final.phases.filter((p) => p.hours > 0)
  const finalH = totalHours(finalPhases)
  const finalStartH = -(finalH + finalMixH)

  /* ---------------- Preferments ---------------- */
  const prefStates: PrefState[] = prefs.map((p) => {
    const pc = comp0.prefs.find((c) => c.id === p.id)!
    const masses: ThermalMass[] = [{ label: 'flour', massG: pc.freshFlour, cp: C_FLOUR, tempC: flourC }]
    if (pc.seed > 0) masses.push({ label: 'seed', massG: pc.seed, cp: mixCp(1, p.seedHydration / 100), tempC: k.roomC })
    if (pc.salt > 0) masses.push({ label: 'salt', massG: pc.salt, cp: C_SALT, tempC: k.roomC })
    const ws = solveWater({
      masses,
      waterG: pc.freshWater,
      newFlourG: pc.freshFlour,
      targetC: p.targetTempC,
      mixerRiseC: prefRise,
      tapC: k.tapC,
    })
    const classic = classicWaterTemp({ targetC: p.targetTempC, flourC, roomC: k.roomC, frictionFactorC: 0, prefermentTempsC: [] })
    const water: WaterPlan = { ...ws, targetC: p.targetTempC, mixerRiseC: prefRise, classicWaterC: classic }
    const phases = p.phases.filter((ph) => ph.hours > 0)
    const segs: SimSegment[] = phases.map((ph) => ({ envC: tempOf(ph), hours: ph.hours, pieceMassG: Math.max(100, pc.total) }))
    const sim = simulate(segs, ws.expectedC)
    let yeastFreshPct = 0
    let seedPct = 0
    let ripeness = 1
    if (p.leavening === 'yeast') {
      const res = prefYeast(p, sim, p.amountMode === 'manual' ? yeastToFresh(p.manualPct, r.yeastType) : null, scale)
      yeastFreshPct = res.y
      ripeness = res.ripeness
    } else {
      seedPct = p.amountMode === 'manual' ? p.manualPct : Math.min(200, seedForDoublings(sim.sdDoublings) * 100 * scale)
      ripeness = sim.sdDoublings / doublingsForSeed(seedPct / 100 / scale)
    }
    // Place phases on the bake-relative clock.
    const startH = finalStartH - totalHours(phases)
    let t = startH
    const resolved: ResolvedPhase[] = phases.map((ph, i) => {
      const seg = sim.segments[i]
      const rp: ResolvedPhase = {
        ...ph,
        tempC: tempOf(ph),
        startH: t,
        endH: t + ph.hours,
        progress: sim.eqHours > 0 ? (seg.eqHours / sim.eqHours) * ripeness : 0,
        meanDoughC: seg.meanC,
        endDoughC: seg.endC,
      }
      t += ph.hours
      return rp
    })
    return {
      spec: p,
      yeastFreshPct,
      seedPct,
      ripeness,
      mixC: ws.expectedC,
      endC: sim.endC,
      eqH: sim.eqHours,
      phases: resolved,
      water,
      curve: sim.curve.map((c) => ({ t: startH + c.t, doughC: c.doughC, envC: c.envC })),
    }
  })

  /* ---------------- Final dough water & thermal ---------------- */
  const finalMasses = (comp: Composition): ThermalMass[] => {
    const m: ThermalMass[] = [{ label: 'flour', massG: comp.final.flour, cp: C_FLOUR, tempC: flourC }]
    for (const ps of prefStates) {
      const pc = comp.prefs.find((c) => c.id === ps.spec.id)!
      m.push({ label: `pref:${ps.spec.id}`, massG: pc.total, cp: mixCp(pc.flour, pc.water), tempC: ps.endC })
    }
    if (comp.final.starter > 0)
      m.push({ label: 'starter', massG: comp.final.starter, cp: mixCp(comp.final.starterFlour, comp.final.starterWater), tempC: k.roomC })
    if (comp.final.salt > 0) m.push({ label: 'salt', massG: comp.final.salt, cp: C_SALT, tempC: k.roomC })
    if (comp.final.oil > 0) m.push({ label: 'oil', massG: comp.final.oil, cp: C_OIL, tempC: k.roomC })
    if (comp.final.sugar + comp.final.malt > 0)
      m.push({ label: 'sugar', massG: comp.final.sugar + comp.final.malt, cp: C_SUGAR, tempC: k.roomC })
    return m
  }
  const finalWater = (comp: Composition) => {
    const ws = solveWater({
      masses: finalMasses(comp),
      waterG: comp.final.water,
      newFlourG: comp.final.flour,
      targetC: k.targetFdtC,
      mixerRiseC: mixerRise,
      tapC: k.tapC,
    })
    const classic = classicWaterTemp({
      targetC: k.targetFdtC,
      flourC,
      roomC: k.roomC,
      frictionFactorC: mixer.classicFF,
      prefermentTempsC: prefStates.map((p) => p.endC),
    })
    const plan: WaterPlan = { ...ws, targetC: k.targetFdtC, mixerRiseC: mixerRise, classicWaterC: classic }
    return plan
  }
  const fw0 = finalWater(comp0)

  // Mixing time counts as fermentation at room temperature.
  const finalSegs: SimSegment[] = []
  if (finalMixH > 0) finalSegs.push({ envC: k.roomC, hours: finalMixH, pieceMassG: Math.max(200, comp0.dough) })
  let balled = false
  for (const ph of finalPhases) {
    if ((ph.stage ?? 'bulk') === 'balls') balled = true
    const piece = balled ? (r.sizing.mode === 'pans' ? Math.min(pw, 300) : pw) : Math.max(200, comp0.dough)
    finalSegs.push({ envC: tempOf(ph), hours: ph.hours, pieceMassG: piece })
  }
  const fsim = simulate(finalSegs, fw0.expectedC)

  /* ---------------- Final leavening ---------------- */
  const P = Math.min(1, prefs.reduce((s, p) => s + p.flourPct / 100, 0))
  const required = 1 - P + PREFERMENTED_CREDIT * P
  const mFinal = doughMultiplier({ hydration: r.hydration, saltPct: r.saltPct, oilPct: r.oilPct, sugarPct: r.sugarPct }) * scale
  const target = Math.min(2.5, Math.max(0.5, r.final.proofTarget || 1))
  const eqNeeded = required > 0 ? fsim.eqHours / (required * target) : Infinity

  // Leavening carried by the preferments: commercial yeast in fresh-yeast equivalents on TOTAL
  // flour, sourdough as the fraction of the final fermentation its inoculation covers.
  let carry = 0
  let sdFraction = 0
  for (const ps of prefStates) {
    const p = ps.spec
    const share = p.flourPct / 100
    if (p.leavening === 'yeast') {
      // A ripe preferment carries at least its seed yeast, and grows towards a
      // ~1 %-fresh-yeast-equivalent population (a classic biga) as it ripens.
      // Calibrated like every other yeast amount, so the balance doesn't depend on the scale.
      const floor = prefermentPreset(p.type).carryFreshPct * scale
      carry += share * Math.max(ps.yeastFreshPct, floor * Math.min(1, ps.ripeness))
    } else {
      const levainPct = share * (1 + p.hydration / 100) * 100
      sdFraction += (fsim.sdDoublings / (required * target * doublingsForStarter(levainPct / scale))) * Math.min(1, ps.ripeness)
    }
  }
  const manualExtra = r.final.extraYeastMode === 'manual' ? yeastToFresh(r.final.extraYeastPct, r.yeastType) : 0
  const leavenedByStarter = r.method === 'direct' && r.directLeavening === 'sourdough'
  let directStarterPct = 0
  if (leavenedByStarter) {
    // The starter does the work; an optional manual yeast boost reduces the starter needed.
    const fy = manualExtra > 0 ? eqNeeded / eqHoursForYeast('dough', manualExtra, mFinal) : 0
    const sdAvail = fsim.sdDoublings / target
    directStarterPct =
      r.starterMode === 'manual' ? r.starterPct : Math.min(60, starterForDoublings(sdAvail / Math.max(0.05, 1 - fy)) * scale)
    sdFraction += sdAvail / doublingsForStarter(directStarterPct / scale)
  }
  // Total fresh-yeast equivalent the final fermentation still needs after the sourdough share.
  const yeastNeeded = sdFraction >= 1 ? 0 : yeastForEqHours('dough', eqNeeded / (1 - sdFraction), mFinal)
  let finalYeastFreshPct = 0
  if (leavenedByStarter) finalYeastFreshPct = manualExtra
  else if (r.method === 'direct') finalYeastFreshPct = r.final.extraYeastMode === 'manual' ? manualExtra : yeastNeeded
  else finalYeastFreshPct = r.final.extraYeastMode === 'auto' ? Math.max(0, yeastNeeded - carry) : manualExtra

  const totalLeaven = carry + finalYeastFreshPct
  const yeastFraction = totalLeaven > 0 ? eqNeeded / eqHoursForYeast('dough', totalLeaven, mFinal) : 0
  const finalRipeness = yeastFraction + sdFraction

  /* ---------------- Composition (pass 2) ---------------- */
  const plan: LeaveningPlan = { prefs: {}, finalYeastFreshPct, directStarterPct }
  for (const ps of prefStates) plan.prefs[ps.spec.id] = { yeastFreshPct: ps.yeastFreshPct, seedPct: ps.seedPct }
  const comp = computeComposition(r, plan)

  // Re-solve water with final masses (preferment seeds may have changed).
  for (const ps of prefStates) {
    const pc = comp.prefs.find((c) => c.id === ps.spec.id)!
    const masses: ThermalMass[] = [{ label: 'flour', massG: pc.freshFlour, cp: C_FLOUR, tempC: flourC }]
    if (pc.seed > 0) masses.push({ label: 'seed', massG: pc.seed, cp: mixCp(1, ps.spec.seedHydration / 100), tempC: k.roomC })
    if (pc.salt > 0) masses.push({ label: 'salt', massG: pc.salt, cp: C_SALT, tempC: k.roomC })
    const ws = solveWater({
      masses,
      waterG: pc.freshWater,
      newFlourG: pc.freshFlour,
      targetC: ps.spec.targetTempC,
      mixerRiseC: prefRise,
      tapC: k.tapC,
    })
    ps.water = { ...ps.water!, ...ws }
  }
  const fw = finalWater(comp)

  /* ---------------- Stage results ---------------- */
  const stages: StageResult[] = []
  for (const ps of prefStates) {
    const p = ps.spec
    const pc = comp.prefs.find((c) => c.id === p.id)!
    const preset = prefermentPreset(p.type)
    const lines: IngredientLine[] = []
    lines.push({ key: 'flour', kind: 'flour', label: 'Flour', grams: pc.freshFlour, pct: 100 })
    if (ps.water && ps.water.iceG > 0.5) {
      lines.push({
        key: 'water',
        kind: 'water',
        label: 'Water',
        grams: ps.water.liquidG,
        note: `at ${formatTemp(ps.water.waterC, u)}`,
      })
      lines.push({ key: 'ice', kind: 'ice', label: 'Ice (crushed)', grams: ps.water.iceG, note: 'counts as water' })
    } else {
      lines.push({
        key: 'water',
        kind: 'water',
        label: 'Water',
        grams: pc.freshWater,
        pct: (pc.water / pc.flour) * 100,
        note: ps.water && Number.isFinite(ps.water.waterC) ? `at ${formatTemp(ps.water.waterC, u)}` : undefined,
      })
    }
    if (p.leavening === 'yeast') {
      lines.push({
        key: 'yeast',
        kind: 'yeast',
        label: `Yeast (${YEAST_SHORT[r.yeastType]})`,
        grams: pc.yeast,
        pct: yeastFromFresh(ps.yeastFreshPct, r.yeastType),
      })
    } else {
      lines.push({
        key: 'seed',
        kind: 'starter',
        label: `Ripe starter (${p.seedHydration}% hydration)`,
        grams: pc.seed,
        pct: ps.seedPct,
        note: `1 : ${fmtRatio(100 / Math.max(1, ps.seedPct))} feeding ratio`,
      })
    }
    if (pc.salt > 0) lines.push({ key: 'salt', kind: 'salt', label: 'Salt', grams: pc.salt, pct: p.saltPct })
    if (pc.honey > 0) lines.push({ key: 'honey', kind: 'honey', label: 'Honey or malt', grams: pc.honey, pct: p.honeyPct })
    const dur = totalHours(ps.spec.phases.filter((x) => x.hours > 0))
    stages.push({
      id: p.id,
      kind: 'preferment',
      type: p.type,
      title: p.name || preset.name,
      subtitle: `${formatPct(p.flourPct, 1)} of the flour · ${formatPct(p.hydration, 0)} hydration · ${formatHours(dur)}`,
      ingredients: lines,
      totalWeight: pc.total + (pc.seed > 0 ? 0 : 0),
      flour: pc.flour,
      water: pc.water,
      hydration: p.hydration,
      leavening: {
        kind: p.leavening,
        freshPct: ps.yeastFreshPct,
        typePct: yeastFromFresh(ps.yeastFreshPct, r.yeastType),
        grams: p.leavening === 'yeast' ? pc.yeast : pc.seed,
        starterPct: ps.seedPct,
        mode: p.amountMode,
      },
      phases: ps.phases,
      startH: ps.phases[0]?.startH ?? finalStartH,
      endH: finalStartH,
      totalHours: dur,
      ripeness: ps.ripeness,
      mixTempC: ps.mixC,
      endTempC: ps.endC,
      waterPlan: ps.water,
      equivalentHours20: ps.eqH * (rateAt(REF_C) / rateAt(20)),
      curve: ps.curve,
    })
  }

  // Final dough stage
  const fl: IngredientLine[] = []
  for (const ps of prefStates) {
    const pc = comp.prefs.find((c) => c.id === ps.spec.id)!
    fl.push({
      key: `pref-${ps.spec.id}`,
      kind: 'preferment',
      label: `${ps.spec.name} (all of it)`,
      grams: pc.total,
      note: `at about ${formatTemp(ps.endC, u, 0)}`,
    })
  }
  if (comp.final.flour > 0.5) fl.push({ key: 'flour', kind: 'flour', label: 'Flour', grams: comp.final.flour })
  const mainWater = comp.final.water - comp.final.reserveWater
  if (comp.final.water > 0.5) {
    if (fw.iceG > 0.5) {
      const liquid = Math.max(0, fw.liquidG - comp.final.reserveWater)
      fl.push({ key: 'water', kind: 'water', label: 'Water', grams: liquid, note: `at ${formatTemp(fw.waterC, u)}` })
      fl.push({ key: 'ice', kind: 'ice', label: 'Ice (crushed)', grams: fw.iceG, note: 'counts as water; add with the water' })
    } else {
      fl.push({
        key: 'water',
        kind: 'water',
        label: 'Water',
        grams: mainWater,
        note: Number.isFinite(fw.waterC) ? `at ${formatTemp(fw.waterC, u)}` : undefined,
      })
    }
    if (comp.final.reserveWater > 0.5)
      fl.push({
        key: 'reserve',
        kind: 'water',
        label: 'Water, held back',
        grams: comp.final.reserveWater,
        note: 'bassinage: add slowly at the end',
      })
  }
  if (comp.final.starter > 0)
    fl.push({
      key: 'starter',
      kind: 'starter',
      label: `Ripe starter (${r.starterHydration}%)`,
      grams: comp.final.starter,
      pct: directStarterPct,
    })
  if (comp.final.yeast > 0.0005 || (r.method === 'direct' && r.directLeavening === 'yeast'))
    fl.push({
      key: 'yeast',
      kind: 'yeast',
      label: `${r.method === 'indirect' ? 'Extra yeast' : 'Yeast'} (${YEAST_SHORT[r.yeastType]})`,
      grams: comp.final.yeast,
      pct: yeastFromFresh(finalYeastFreshPct, r.yeastType),
    })
  fl.push({ key: 'salt', kind: 'salt', label: 'Salt', grams: comp.final.salt, pct: r.saltPct })
  if (comp.final.oil > 0) fl.push({ key: 'oil', kind: 'oil', label: 'Olive oil', grams: comp.final.oil, pct: r.oilPct })
  if (comp.final.sugar > 0) fl.push({ key: 'sugar', kind: 'sugar', label: 'Sugar', grams: comp.final.sugar, pct: r.sugarPct })
  if (comp.final.malt > 0) fl.push({ key: 'malt', kind: 'malt', label: 'Diastatic malt', grams: comp.final.malt, pct: r.maltPct })

  let t = finalStartH + finalMixH
  const offset = finalMixH > 0 ? 1 : 0
  const finalResolved: ResolvedPhase[] = finalPhases.map((ph, i) => {
    const seg = fsim.segments[i + offset]
    const rp: ResolvedPhase = {
      ...ph,
      tempC: tempOf(ph),
      startH: t,
      endH: t + ph.hours,
      progress: fsim.eqHours > 0 ? (seg.eqHours / fsim.eqHours) * finalRipeness : 0,
      meanDoughC: seg.meanC,
      endDoughC: seg.endC,
    }
    t += ph.hours
    return rp
  })

  stages.push({
    id: 'final',
    kind: 'final',
    title: r.method === 'indirect' ? 'Final dough' : 'Dough',
    subtitle: `${formatPct(r.hydration, 1)} hydration · ${formatHours(finalH)} of fermentation`,
    ingredients: fl,
    totalWeight: comp.final.total,
    flour: comp.totalFlour,
    water: comp.totalWater,
    hydration: r.hydration,
    leavening: {
      kind: leavenedByStarter ? 'sourdough' : finalYeastFreshPct > 0 ? 'yeast' : 'none',
      freshPct: finalYeastFreshPct,
      typePct: yeastFromFresh(finalYeastFreshPct, r.yeastType),
      grams: leavenedByStarter ? comp.final.starter : comp.final.yeast,
      starterPct: directStarterPct,
      mode: r.method === 'direct' ? (r.final.extraYeastMode === 'manual' ? 'manual' : 'auto') : r.final.extraYeastMode === 'none' ? 'none' : r.final.extraYeastMode,
    },
    phases: finalResolved,
    startH: finalStartH,
    endH: 0,
    totalHours: finalH + finalMixH,
    ripeness: finalRipeness,
    mixTempC: fw.expectedC,
    endTempC: fsim.endC,
    waterPlan: fw,
    equivalentHours20: fsim.eqHours * (rateAt(REF_C) / rateAt(20)),
    curve: fsim.curve.map((c) => ({ t: finalStartH + c.t, doughC: c.doughC, envC: c.envC })),
  })

  /* ---------------- Timeline ---------------- */
  const oven = ovenById(r.ovenId)
  const style = styleById(r.styleId)
  const waterNote = (w: WaterPlan | null, grams: number) => {
    if (!w || !Number.isFinite(w.waterC)) return ''
    if (w.iceG > 0.5)
      return `Use ${formatWeight(w.liquidG)} water at ${formatTemp(w.waterC, u)} plus ${formatWeight(w.iceG)} crushed ice.`
    return `Use ${formatWeight(grams)} of water at ${formatTemp(w.waterC, u)}.`
  }
  const waterNotes: Record<string, string> = {}
  for (const ps of prefStates) {
    const pc = comp.prefs.find((c) => c.id === ps.spec.id)!
    waterNotes[ps.spec.id] = waterNote(ps.water, pc.freshWater)
  }
  waterNotes.final = `${waterNote(fw, comp.final.water)} Aim for a dough at ${formatTemp(k.targetFdtC, u)} when kneading ends.`
  const feedLead: Record<string, number> = {}
  const oneToOneH = doublingsForSeed(1) * sdDoublingHours(k.roomC)
  for (const ps of prefStates) if (ps.spec.leavening === 'sourdough') feedLead[ps.spec.id] = oneToOneH
  const timeline = buildTimeline(
    {
      recipe: r,
      tempOf,
      finalMixH,
      preheatMin: oven.preheatMin,
      bakeLabel: `${style.bake}. ${style.shaping}`,
      feedLeadH: feedLead,
      directFeedLeadH: r.method === 'direct' && r.directLeavening === 'sourdough' ? oneToOneH : 0,
      waterNotes,
    },
    (c) => formatTemp(c, u, 0),
  ).map((e) => ({ ...e, detail: e.detail && localizeTemps(e.detail, u) }))

  /* ---------------- Totals & load ---------------- */
  const prefLoad = prefStates.reduce((m, ps) => Math.max(m, ps.eqH), 0)
  const load20 = (fsim.eqHours + prefLoad) * (rateAt(REF_C) / rateAt(20))
  const recW = recommendedW(load20)
  const firstH = Math.min(finalStartH, ...timeline.map((e) => e.atH))

  const curve: CurvePoint[] = [
    ...prefStates.flatMap((ps) => (prefStates.length === 1 ? ps.curve : [])),
    ...fsim.curve.map((c) => ({ t: finalStartH + c.t, doughC: c.doughC, envC: c.envC })),
  ]

  const result: RecipeResult = {
    totals: {
      flour: comp.totalFlour,
      water: comp.totalWater,
      salt: comp.salt,
      oil: comp.oil,
      sugar: comp.sugar,
      malt: comp.malt,
      honey: comp.honey,
      yeast: comp.yeast,
      yeastFreshEq: comp.yeastFresh,
      starter: comp.starter,
      dough: comp.dough,
      prefermentedFlourPct: P * 100,
    },
    stages,
    timeline,
    advice,
    totalHours: -firstH,
    fermentationLoad20: load20,
    recommendedW: recW,
    pieceWeight: pw,
    pieces: comp.pieces,
    curve,
  }

  collectAdvice(r, result, comp, prefStates, { fw, carry, yeastNeeded, finalRipeness, required, u, add, mixerRise })
  return result
}

/* ------------------------------------------------------------------ */

function fmtRatio(x: number): string {
  const r = Math.round(x * 2) / 2
  return `${r} : ${r}`
}

interface AdviceCtx {
  fw: WaterPlan
  carry: number
  yeastNeeded: number
  finalRipeness: number
  required: number
  u: TempUnit
  add: (a: Advice) => void
  mixerRise: number
}

function collectAdvice(r: Recipe, res: RecipeResult, comp: Composition, prefStates: PrefState[], ctx: AdviceCtx) {
  const { add, u } = ctx
  const k = r.kitchen

  for (const issue of comp.issues) {
    if (issue.kind === 'water')
      add({
        severity: 'error',
        scope: 'recipe',
        title: 'The preferments hold more water than the whole dough',
        detail: `They need ${formatWeight(issue.excess)} more water than the recipe allows. Raise the overall hydration to at least ${formatPct(issue.minHydration ?? 0, 1)}, lower the preferment share, or make the poolish stiffer.`,
      })
    if (issue.kind === 'flour')
      add({
        severity: 'error',
        scope: 'recipe',
        title: 'More than 100 % of the flour is in preferments',
        detail: 'Reduce the preferment shares so they add up to 100 % or less.',
      })
    if (issue.kind === 'salt')
      add({
        severity: 'warn',
        scope: 'recipe',
        title: 'Preferments contain more salt than the recipe total',
        detail: 'Lower the salt in the preferments or raise the total salt.',
      })
  }

  const final = res.stages.find((s) => s.id === 'final')!
  if (r.method === 'indirect' && comp.final.water < comp.totalFlour * 0.03 && comp.final.water >= 0 && !comp.issues.length)
    add({
      severity: 'tip',
      scope: 'final',
      title: 'Almost no free water left for the final dough',
      detail: 'Dissolve the salt in a splash of reserved water or add it dry near the end of mixing.',
    })

  // Water plans
  const describeWater = (w: WaterPlan | null, scope: string, name: string) => {
    if (!w) return
    if (w.status === 'ice')
      add({
        severity: 'info',
        scope,
        title: `${name}: your tap water isn't cold enough — use ice`,
        detail: `Replace ${formatWeight(w.iceG)} of the water with crushed ice (it would otherwise need ${formatTemp(w.idealWaterC, u)} water).${r.yeastType === 'instant' ? ' Mix instant yeast into the flour, not into the icy water.' : ''}`,
      })
    if (w.status === 'too-cold')
      add({
        severity: 'warn',
        scope,
        title: `${name}: even with ice the dough will be ${formatTemp(w.expectedC, u)}`,
        detail: `Chill the flour${w.flourNeededC !== undefined ? ` (to about ${formatTemp(w.flourNeededC, u, 0)})` : ''} or the preferments beforehand. The forecast already assumes the warmer start.`,
      })
    if (w.status === 'too-hot')
      add({
        severity: 'warn',
        scope,
        title: `${name}: water alone can't warm this dough to target`,
        detail: `It would need ${formatTemp(w.idealWaterC, u)} water; use ${formatTemp(w.waterC, u)} and expect ${formatTemp(w.expectedC, u)}. Let cold preferments warm up first, or use warmer flour. The forecast already accounts for the cooler start.`,
      })
  }
  for (const ps of prefStates) describeWater(ps.water, ps.spec.id, ps.spec.name)
  describeWater(ctx.fw, 'final', r.method === 'indirect' ? 'Final dough' : 'Dough')

  // Preferment-specific wisdom
  for (const ps of prefStates) {
    const p = ps.spec
    const first = ps.phases[0]
    if (p.type === 'biga') {
      if (p.hydration < 40 || p.hydration > 60)
        add({ severity: 'warn', scope: p.id, title: 'Biga hydration is outside 40–60 %', detail: 'Classic bigas sit at 44–50 %; MasterBiga-style hot-weather bigas go up to 60 %.' })
      const roomPhase = ps.phases.find((x) => x.location === 'room')
      if (roomPhase && k.roomC > 30)
        add({
          severity: 'warn',
          scope: p.id,
          title: `Room at ${formatTemp(k.roomC, u, 0)}: go fridge-only`,
          detail: 'Above 30 °C pros make a 60 % biga and put it straight into the fridge for ~24 h.',
        })
      else if (roomPhase && k.roomC > 26 && ps.phases.every((x) => x.location !== 'fridge'))
        add({
          severity: 'tip',
          scope: p.id,
          title: 'Hot room: use a two-stage biga',
          detail: 'Above 26 °C start the biga at room temperature, then finish it in the fridge (4 °C) to keep it from over-ripening.',
        })
      if (first && first.location !== 'fridge' && ps.mixC > 21.5)
        add({
          severity: 'tip',
          scope: p.id,
          title: `Biga will finish mixing at ${formatTemp(ps.mixC, u)}`,
          detail: 'Aim for 18–21 °C for a biga fermented at room or cellar temperature.',
        })
    }
    if (p.type === 'poolish' && ps.phases.some((x) => x.location !== 'fridge' && x.tempC > 25 && x.hours >= 8))
      add({
        severity: 'tip',
        scope: p.id,
        title: 'Long warm poolish',
        detail: 'Above ~25 °C poolish peaks fast and sours. Consider 1 h at room then the fridge.',
      })
    if (p.leavening === 'yeast' && p.amountMode === 'auto' && ps.yeastFreshPct > 3)
      add({
        severity: 'warn',
        scope: p.id,
        title: `${p.name}: very short schedule`,
        detail: `It needs ${formatPct(ps.yeastFreshPct, 1)} fresh yeast to ripen in time. Give it more time or warmth for better flavour.`,
      })
    if (p.leavening === 'yeast' && p.amountMode === 'auto' && ps.yeastFreshPct < 0.02)
      add({
        severity: 'tip',
        scope: p.id,
        title: `${p.name}: tiny yeast dose`,
        detail: 'Very long or warm plans need almost no yeast — weigh it with the dilution trick (see Yeast converter).',
      })
    if (p.amountMode === 'manual') {
      if (ps.ripeness < 0.8)
        add({
          severity: 'warn',
          scope: p.id,
          title: `${p.name} will be under-ripe (${Math.round(ps.ripeness * 100)} %)`,
          detail: 'Add yeast, warmth or time — or switch the amount to Auto.',
        })
      if (ps.ripeness > 1.3)
        add({
          severity: 'warn',
          scope: p.id,
          title: `${p.name} will be over-ripe (${Math.round(ps.ripeness * 100)} %)`,
          detail: 'Reduce the yeast, shorten the schedule or move part of it to the fridge.',
        })
    }
    if (p.leavening === 'sourdough' && p.amountMode === 'auto') {
      if (ps.seedPct > 150)
        add({
          severity: 'warn',
          scope: p.id,
          title: `${p.name}: schedule too short for a sourdough build`,
          detail: 'Even a 1 : 1 : 1 feed needs ~4–7 h at room temperature. Lengthen it or keep it warmer.',
        })
      if (ps.seedPct < 5)
        add({
          severity: 'tip',
          scope: p.id,
          title: `${p.name}: long build`,
          detail: `A ${fmtRatio(100 / Math.max(1, ps.seedPct))} feed is very dilute. Fine for flavour, but keep the temperature steady.`,
        })
    }
  }

  // Final fermentation
  if (r.method === 'indirect' && r.final.extraYeastMode === 'auto' && ctx.carry >= ctx.yeastNeeded && ctx.finalRipeness > 1.15) {
    const hoursFaster = res.stages.find((s) => s.id === 'final')!.totalHours * (1 - 1 / ctx.finalRipeness)
    const strong = ctx.finalRipeness > 1.35
    add({
      severity: strong ? 'warn' : 'tip',
      scope: 'final',
      title: strong ? 'The preferments alone will over-ferment this dough' : 'Preferments will run a little ahead',
      detail: strong
        ? `No extra yeast is needed, and the dough will likely be ready about ${formatHours(hoursFaster)} early. Shorten the final fermentation, move part of it to the fridge, or use a smaller preferment share.`
        : `No extra yeast needed. Expect the balls to be ready up to ${formatHours(hoursFaster)} early — keep an eye on them, or proof a little cooler.`,
    })
  } else if (r.method === 'indirect' && r.final.extraYeastMode !== 'manual' && ctx.carry >= ctx.yeastNeeded) {
    add({
      severity: 'info',
      scope: 'final',
      title: 'No extra yeast needed',
      detail: 'The ripe preferments carry enough leavening for the final fermentation.',
    })
  }
  if (final.ripeness > 0 && (r.final.extraYeastMode === 'manual' || r.final.extraYeastMode === 'none')) {
    if (final.ripeness < 0.8)
      add({
        severity: 'warn',
        scope: 'final',
        title: `Dough will be under-proofed (${Math.round(final.ripeness * 100)} %)`,
        detail: 'Add yeast or time, or switch extra yeast to Auto.',
      })
    if (final.ripeness > 1.3)
      add({
        severity: 'warn',
        scope: 'final',
        title: `Dough will be over-proofed (${Math.round(final.ripeness * 100)} %)`,
        detail: 'Reduce yeast or shorten the schedule.',
      })
  }
  if (final.leavening.kind === 'yeast' && final.leavening.grams > 0 && final.leavening.grams < 0.3)
    add({
      severity: 'tip',
      scope: 'final',
      title: `Only ${formatWeight(final.leavening.grams)} of yeast`,
      detail: 'Most kitchen scales can’t weigh that. Dissolve 1 g in 100 g of water and use the matching amount of solution (Tools → Yeast converter).',
    })
  if (r.method === 'direct' && r.directLeavening === 'yeast' && r.final.extraYeastMode !== 'manual') {
    const pct = final.leavening.freshPct
    if (pct > 3)
      add({
        severity: 'warn',
        scope: 'final',
        title: 'Very short fermentation',
        detail: `This plan needs ${formatPct(pct, 1)} fresh yeast. The dough will taste yeasty — give it more time or a cooler, longer schedule.`,
      })
  }

  // Tempering after the fridge
  const phases = final.phases
  for (let i = 1; i < phases.length; i++) {
    const prev = phases[i - 1]
    const cur = phases[i]
    if (prev.location === 'fridge' && cur.location !== 'fridge' && i === phases.length - 1) {
      const need = hoursToReach(prev.endDoughC, 13, cur.tempC, r.sizing.mode === 'pans' ? 250 : res.pieceWeight)
      if (Number.isFinite(need) && cur.hours < need * 0.85)
        add({
          severity: 'warn',
          scope: 'final',
          title: 'Not enough time out of the fridge',
          detail: `${r.sizing.mode === 'pans' ? 'The dough' : 'Balls this size'} need about ${formatHours(need)} at ${formatTemp(cur.tempC, u, 0)} to warm to ~13 °C and relax; the plan gives ${formatHours(cur.hours)}.`,
        })
    }
  }
  if (phases.length && phases[phases.length - 1].location === 'fridge')
    add({
      severity: 'warn',
      scope: 'final',
      title: 'The plan ends in the fridge',
      detail: 'Cold dough tears and bakes pale. Add a final room-temperature phase of 1.5–3 h to temper the balls.',
    })

  // Flour strength
  const flour = flourById(r.flourId)
  const rec = res.recommendedW
  if (flour.w[1] < rec.min - 30)
    add({
      severity: 'warn',
      scope: 'recipe',
      title: `${flour.name} may be too weak for this plan`,
      detail: `The fermentation load is ≈ ${formatHours(res.fermentationLoad20)} at 20 °C; aim for W ${rec.min}–${rec.max}. Weak flour gets slack and sticky in long ferments.`,
    })
  for (const ps of prefStates)
    if (ps.spec.type === 'biga' && flour.w[1] < 300)
      add({
        severity: 'tip',
        scope: ps.spec.id,
        title: 'Use a strong flour for the biga',
        detail: 'Bigas need W 300+ (ideally 320–380) to survive 16 h+. You can still close the dough with a medium flour.',
      })

  // Oven vs formula
  const oven = ovenById(r.ovenId)
  if (oven.tempC[1] < 350 && r.sugarPct + r.maltPct === 0 && r.oilPct === 0)
    add({
      severity: 'tip',
      scope: 'recipe',
      title: `A ${oven.name.toLowerCase()} runs cool for a lean dough`,
      detail: 'For better browning add 1–2 % sugar or 0.5–1 % diastatic malt and 2–3 % oil (use malt only with unmalted Italian flour).',
    })
  if (oven.tempC[0] >= 400 && (r.sugarPct > 0.5 || r.oilPct > 2))
    add({
      severity: 'tip',
      scope: 'recipe',
      title: 'Sugar and oil burn above 400 °C',
      detail: 'Neapolitan-style ovens need no sugar or oil — they can scorch the crust in 60–90 s.',
    })
  if (flour.id.startsWith('us-') && r.maltPct > 0)
    add({
      severity: 'info',
      scope: 'recipe',
      title: 'US flours are already malted',
      detail: 'Extra diastatic malt can make the crumb gummy — you can probably skip it.',
    })
  if (r.saltPct < 1.5 || r.saltPct > 3.5)
    add({ severity: 'info', scope: 'recipe', title: `Salt at ${formatPct(r.saltPct, 1)}`, detail: 'Most pizza doughs use 2–3 %.' })
  const style = styleById(r.styleId)
  if (r.hydration < style.hydrationRange[0] - 2 || r.hydration > style.hydrationRange[1] + 2)
    add({
      severity: 'info',
      scope: 'recipe',
      title: `Hydration is unusual for ${style.name}`,
      detail: `Typical range ${style.hydrationRange[0]}–${style.hydrationRange[1]} %.`,
    })
  if (r.hydration >= 72 && r.final.reservePct === 0 && ctx.mixerRise > 0)
    add({
      severity: 'tip',
      scope: 'final',
      title: 'Try bassinage',
      detail: 'Hold back 5–10 % of the water and add it slowly once the dough is strong — high hydration doughs come together far better.',
    })
  if (k.targetFdtC > 27 || k.targetFdtC < 18)
    add({
      severity: 'info',
      scope: 'final',
      title: `Target dough temperature ${formatTemp(k.targetFdtC, u, 0)}`,
      detail: 'Most pizza doughs aim for 22–25 °C at the end of mixing.',
    })
}
