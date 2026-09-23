import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Recipe } from '../engine/types'
import { migrateRecipe } from './recipes'

/** Builds a link that opens the recipe in anyone's Pizza Weather app. */
export function shareUrl(recipe: Recipe): string {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = recipe
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
