import { useEffect, useMemo, useState } from 'react'
import type { Recipe, RecipeResult } from '../engine/types'
import { computeRecipe } from '../engine/compute'
import { useSettings } from './store'
import { defaultBakeTime } from '../lib/time'

/** Runs the whole engine for a recipe with the user's calibrations and units. */
export function useCompute(recipe: Recipe | null | undefined): RecipeResult | null {
  const settings = useSettings()
  const rise = recipe ? settings.mixerRise[recipe.kitchen.mixerId] : undefined
  return useMemo(() => {
    if (!recipe) return null
    try {
      return computeRecipe(recipe, { calibratedRiseC: rise, tempUnit: settings.tempUnit, yeastScale: settings.yeastScale })
    } catch (e) {
      console.error(e)
      return null
    }
  }, [recipe, rise, settings.tempUnit, settings.yeastScale])
}

/** The bake time: stored, or the next sensible dinner time that fits the plan. */
export function bakeDateOf(recipe: Recipe, result: RecipeResult | null): Date {
  if (recipe.bakeAt) {
    const d = new Date(recipe.bakeAt)
    if (!Number.isNaN(d.getTime())) return d
  }
  return defaultBakeTime((result?.totalHours ?? 24) + 0.25)
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
