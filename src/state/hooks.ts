import { useEffect, useMemo, useState } from 'react'
import type { Recipe, RecipeResult } from '../engine/types'
import { computeRecipe, planDurationH } from '../engine/compute'
import { useSettings } from './store'
import type { DayPlan } from '../engine/schedule'
import { defaultBakeTime } from '../lib/time'

/** The hours the user doesn't want to be in the kitchen. */
export function useDayPlan(): DayPlan {
  const s = useSettings()
  return useMemo(
    () => ({ sleepFrom: s.sleepFrom, sleepTo: s.sleepTo, workOn: s.workOn, workFrom: s.workFrom, workTo: s.workTo }),
    [s.sleepFrom, s.sleepTo, s.workOn, s.workFrom, s.workTo],
  )
}

/** The user's calibrations and units as engine options (without the bake time). */
export function useComputeOptions(recipe: Recipe | null | undefined) {
  const settings = useSettings()
  const rise = recipe ? settings.mixerRise[recipe.kitchen.mixerId] : undefined
  return useMemo(
    () => ({
      calibratedRiseC: rise,
      tempUnit: settings.tempUnit,
      yeastScale: settings.yeastScale,
      starterSpeed: settings.starterSpeed,
      altitudeM: settings.altitudeM,
    }),
    [rise, settings.tempUnit, settings.yeastScale, settings.starterSpeed, settings.altitudeM],
  )
}

/** Runs the whole engine for a recipe with the user's calibrations and units. */
export function useCompute(recipe: Recipe | null | undefined): RecipeResult | null {
  const settings = useSettings()
  const rise = recipe ? settings.mixerRise[recipe.kitchen.mixerId] : undefined
  return useMemo(() => {
    if (!recipe) return null
    try {
      return computeRecipe(recipe, {
        calibratedRiseC: rise,
        tempUnit: settings.tempUnit,
        yeastScale: settings.yeastScale,
        starterSpeed: settings.starterSpeed,
        altitudeM: settings.altitudeM,
        bakeAtMs: bakeDateOf(recipe).getTime(),
      })
    } catch (e) {
      console.error(e)
      return null
    }
  }, [recipe, rise, settings.tempUnit, settings.yeastScale, settings.starterSpeed, settings.altitudeM])
}

/** The bake time: stored, or the next sensible dinner time that fits the plan. */
export function bakeDateOf(recipe: Recipe): Date {
  if (recipe.bakeAt) {
    const d = new Date(recipe.bakeAt)
    if (!Number.isNaN(d.getTime())) return d
  }
  return defaultBakeTime(planDurationH(recipe) + 0.25)
}

export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export const atTime = (bake: Date, hoursRelative: number): Date => new Date(bake.getTime() + hoursRelative * 3600000)
