import type { PrefermentSpec, PrefermentType, Recipe } from '../engine/types'
import { makePhase, uid } from '../engine/phases'
import { prefermentPreset, scheduleById, styleById, type StylePreset } from '../engine/presets'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { mixerById } from '../engine/mixers'
import { computeRecipe } from '../engine/compute'
import { defaultBakeTime } from '../lib/time'

export function makePreferment(type: PrefermentType, flourPct?: number, settings?: Pick<Settings, 'roomC'>): PrefermentSpec {
  const p = prefermentPreset(type)
  const room = settings?.roomC ?? 21
  // A biga at 18 °C needs a cool spot; in a warm kitchen default to room→fridge instead.
  let schedule = p.schedule
  if (type === 'biga' && room >= 24) {
    schedule = [
      { location: 'room', hours: 2 },
      { location: 'fridge', hours: 22 },
    ]
  }
  // Overnight poolish at room temperature is the classic; above ~25 °C it races, so use the fridge.
  if (type === 'poolish' && room >= 25) {
    schedule = [
      { location: 'room', hours: 1 },
      { location: 'fridge', hours: 16 },
    ]
  }
  return {
    id: uid('pf'),
    type,
    name: p.name,
    flourPct: flourPct ?? p.flourPct,
    hydration: p.hydration,
    leavening: p.leavening,
    amountMode: 'auto',
    manualPct: p.leavening === 'sourdough' ? 50 : type === 'biga' ? 0.33 : 0.1,
    saltPct: p.saltPct,
    honeyPct: p.honeyPct,
    seedHydration: p.seedHydration,
    phases: schedule.map((s) => makePhase(s.location, s.hours, undefined, s.customTempC ?? 18)),
    targetTempC: p.targetTempC,
  }
}

export function recipeFromStyle(styleId: string, settings: Settings = DEFAULT_SETTINGS, indirect?: boolean): Recipe {
  const st: StylePreset = styleById(styleId)
  const method = indirect === undefined ? st.method : indirect ? 'indirect' : 'direct'
  const schedule = scheduleById(method === 'indirect' && st.method === 'direct' ? 'after-preferment' : st.scheduleId)
  const prefs =
    method === 'indirect'
      ? (st.preferments ?? [{ type: 'poolish' as const, flourPct: 30 }]).map((p) => makePreferment(p.type, p.flourPct, settings))
      : []
  const now = Date.now()
  const mixer = mixerById(settings.mixerId)
  const recipe: Recipe = {
    id: uid('r'),
    name: st.name,
    styleId: st.id,
    ovenId: st.ovenId,
    flourId: st.flourId,
    createdAt: now,
    updatedAt: now,
    sizing: {
      mode: st.sizing.mode,
      count: st.sizing.count ?? 4,
      ballWeight: st.sizing.ballWeight ?? 250,
      panShape: st.sizing.panShape ?? 'rect',
      panWidthCm: st.sizing.panWidthCm ?? 30,
      panLengthCm: st.sizing.panLengthCm ?? 40,
      panDiameterCm: st.sizing.panDiameterCm ?? 25.4,
      thicknessFactor: st.sizing.thicknessFactor ?? 0.55,
    },
    wastePct: st.wastePct,
    hydration: st.hydration,
    saltPct: st.saltPct,
    oilPct: st.oilPct,
    sugarPct: st.sugarPct,
    maltPct: st.maltPct,
    yeastType: settings.yeastType,
    method,
    directLeavening: 'yeast',
    starterMode: 'auto',
    starterPct: 15,
    starterHydration: 100,
    preferments: prefs,
    final: {
      phases: schedule.phases.map((p) => makePhase(p.location, p.hours, p.stage)),
      extraYeastMode: 'auto',
      extraYeastPct: 0,
      reservePct: st.reservePct,
      mixMinutes: mixer.mixMinutes,
      proofTarget: st.proofTarget,
      autolyseMin: 0,
      folds: st.folds ?? 0,
      foldEveryMin: st.foldEveryMin ?? 30,
    },
    kitchen: {
      roomC: settings.roomC,
      flourC: null,
      tapC: settings.tapC,
      fridgeC: settings.fridgeC,
      mixerId: settings.mixerId,
      mixerRiseC: null,
      targetFdtC: st.targetFdtC,
      nightC: settings.nightC,
    },
    bakeAt: null,
    notes: '',
  }
  return recipe
}

/** Sets a sensible default bake time given the recipe's total duration. */
export function withDefaultBakeTime(r: Recipe, totalHours: number): Recipe {
  return { ...r, bakeAt: defaultBakeTime(totalHours + 0.5).toISOString() }
}

/**
 * Fills in any fields missing from recipes saved by older versions (or shared links),
 * and rejects things that aren't recipes at all.
 */
export function migrateRecipe(input: unknown): Recipe | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Partial<Recipe>
  if (typeof r.styleId !== 'string' || typeof r.hydration !== 'number') return null
  const base = recipeFromStyle(r.styleId)
  const merged: Recipe = {
    ...base,
    ...r,
    id: typeof r.id === 'string' ? r.id : base.id,
    sizing: { ...base.sizing, ...(r.sizing ?? {}) },
    final: { ...base.final, ...(r.final ?? {}) },
    kitchen: { ...base.kitchen, ...(r.kitchen ?? {}) },
    preferments: Array.isArray(r.preferments)
      ? r.preferments.map((p) => ({ ...makePreferment(p.type ?? 'custom'), ...p }))
      : base.preferments,
  }
  return merged
}

/** Switches a recipe to another style's defaults, keeping the kitchen, yeast type and plan. */
export function applyStyle(r: Recipe, styleId: string, settings: Settings): Recipe {
  const fresh = recipeFromStyle(styleId, { ...settings, yeastType: r.yeastType, mixerId: r.kitchen.mixerId })
  return {
    ...fresh,
    id: r.id,
    createdAt: r.createdAt,
    bakeAt: r.bakeAt,
    notes: r.notes,
    kitchen: { ...r.kitchen, targetFdtC: fresh.kitchen.targetFdtC },
  }
}

export type MethodPreset = 'direct' | 'direct-sourdough' | 'biga' | 'poolish' | 'biga-poolish' | 'levain' | 'custom'

/** Applies a leavening method preset: preferments + a matching final schedule. */
export function applyMethod(r: Recipe, m: MethodPreset, settings: Pick<Settings, 'roomC'>): Recipe {
  const st = styleById(r.styleId)
  const directSchedule = scheduleById(st.method === 'direct' ? st.scheduleId : 'cold-balls-24')
  const indirectSchedule = scheduleById(st.method === 'indirect' ? st.scheduleId : 'after-preferment')
  const phases = (tpl: ReturnType<typeof scheduleById>) => tpl.phases.map((p) => makePhase(p.location, p.hours, p.stage))
  const wasIndirect = r.method === 'indirect'
  switch (m) {
    case 'direct':
    case 'direct-sourdough':
      return {
        ...r,
        method: 'direct',
        directLeavening: m === 'direct' ? 'yeast' : 'sourdough',
        preferments: [],
        final: { ...r.final, phases: wasIndirect ? phases(directSchedule) : r.final.phases, extraYeastMode: 'auto' },
      }
    case 'custom':
      return {
        ...r,
        method: 'indirect',
        final: { ...r.final, phases: wasIndirect ? r.final.phases : phases(indirectSchedule) },
      }
    default: {
      const prefs =
        m === 'biga'
          ? [makePreferment('biga', r.hydration >= 68 ? 50 : 40, settings)]
          : m === 'poolish'
            ? [makePreferment('poolish', Math.min(30, r.hydration - 5), settings)]
            : m === 'biga-poolish'
              ? [makePreferment('biga', 30, settings), makePreferment('poolish', Math.min(20, r.hydration - 20), settings)]
              : [makePreferment('licoli', 15, settings)]
      // Natural leavening needs a longer final fermentation than a yeasted preferment.
      const finalPhases = m === 'levain' ? phases(scheduleById('sourdough-day')) : wasIndirect ? r.final.phases : phases(indirectSchedule)
      const next: Recipe = {
        ...r,
        method: 'indirect',
        preferments: prefs,
        final: { ...r.final, phases: finalPhases, extraYeastMode: m === 'levain' ? 'none' : 'auto' },
      }
      return m === 'levain' ? sizeLevain(next) : next
    }
  }
}

/**
 * A levain is the only leavening of a sourdough dough, so its share sets the pace: pick the share
 * of flour that leaves the final dough ripe exactly at the end of its schedule.
 */
function sizeLevain(r: Recipe): Recipe {
  const withPct = (pct: number): Recipe => ({ ...r, preferments: r.preferments.map((p) => ({ ...p, flourPct: pct })) })
  const ripeness = (pct: number) => computeRecipe(withPct(pct)).stages.at(-1)?.ripeness ?? 1
  let lo = 3
  let hi = 30
  if (ripeness(hi) <= 1) return withPct(hi)
  if (ripeness(lo) >= 1) return withPct(lo)
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    if (ripeness(mid) > 1) hi = mid
    else lo = mid
  }
  return withPct(Math.round((lo + hi) / 2 * 2) / 2)
}

/** Short description of how a recipe is leavened, e.g. "Biga 30% + Poolish 20%". */
export function methodLabel(r: Recipe): string {
  if (r.method === 'direct') return r.directLeavening === 'sourdough' ? 'Direct sourdough' : 'Direct'
  return r.preferments.map((p) => `${prefermentPreset(p.type).name} ${Math.round(p.flourPct)}%`).join(' + ')
}

export function methodOf(r: Recipe): MethodPreset {
  if (r.method === 'direct') return r.directLeavening === 'sourdough' ? 'direct-sourdough' : 'direct'
  const types = r.preferments.map((p) => p.type).sort().join('+')
  if (types === 'biga') return 'biga'
  if (types === 'poolish') return 'poolish'
  if (types === 'biga+poolish') return 'biga-poolish'
  if (types === 'licoli' || types === 'lievito-madre') return 'levain'
  return 'custom'
}
