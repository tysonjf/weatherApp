import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Recipe } from '../engine/types'
import { migrateRecipe } from './recipes'
import { resetLive } from '../engine/replan'

/** Builds a link that opens the recipe in anyone's Pizza Weather app (as a fresh plan, without your live state). */
export function shareUrl(recipe: Recipe): string {
  const { id: _id, createdAt: _c, updatedAt: _u, live: _l, ...rest } = resetLive(recipe)
  const payload = compressToEncodedURIComponent(JSON.stringify(rest))
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  return `${base}#/import?r=${payload}`
}

export function decodeShared(payload: string): Recipe | null {
  try {
    const json = decompressFromEncodedURIComponent(payload)
    if (!json) return null
    return migrateRecipe(JSON.parse(json))
  } catch {
    return null
  }
}
