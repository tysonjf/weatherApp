import type { YeastType } from './types'

/**
 * Weight of each yeast type equivalent to 1 g of fresh (compressed) yeast.
 * Fresh : active dry : instant ≈ 1 : 0.4 : 0.33 — the ratios used by Craig's pizzamaking.com
 * charts (IDY × 3 = CY, ADY = IDY × 1.25) and by most Italian sources (1 g fresh ≈ 0.33 g dry).
 */
export const YEAST_FACTOR: Record<YeastType, number> = {
  fresh: 1,
  'active-dry': 0.4,
  instant: 1 / 3,
}

export const YEAST_LABEL: Record<YeastType, string> = {
  fresh: 'Fresh yeast',
  'active-dry': 'Active dry yeast',
  instant: 'Instant dry yeast',
}

export const YEAST_SHORT: Record<YeastType, string> = {
  fresh: 'CY',
  'active-dry': 'ADY',
  instant: 'IDY',
}

export const yeastFromFresh = (fresh: number, type: YeastType): number => fresh * YEAST_FACTOR[type]
export const yeastToFresh = (amount: number, type: YeastType): number => amount / YEAST_FACTOR[type]
