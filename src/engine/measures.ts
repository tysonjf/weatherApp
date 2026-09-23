/**
 * Amounts too small to weigh. Kitchen scales read to 1 g (±1–2 g), pocket scales to 0.1 g or 0.01 g;
 * below ~5 steps of the scale the reading is too rough. Teaspoon weights are King Arthur / label
 * values (instant yeast 3.1 g/tsp, fine salt 6 g, sugar 4.2 g, honey 7 g, olive oil 4.5 g).
 */
import type { IngredientKind, YeastType } from './types'
import { formatNumber } from './units'

const PER_TSP: Partial<Record<IngredientKind, number>> = { salt: 6, sugar: 4.2, honey: 7, malt: 3, oil: 4.5 }
const YEAST_PER_TSP: Record<YeastType, number | null> = { instant: 3.1, 'active-dry': 3.1, fresh: null }

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, '1'],
  [1.25, '1¼'],
  [1.5, '1½'],
  [1.75, '1¾'],
  [2, '2'],
  [2.5, '2½'],
  [3, '3'],
  [4, '4'],
  [5, '5'],
  [6, '6'],
]

/** "≈ ¼ tsp" style measure for small dry amounts, or null when a spoon doesn't make sense. */
export function teaspoons(kind: IngredientKind, grams: number, yeastType?: YeastType): string | null {
  const per = kind === 'yeast' ? (yeastType ? YEAST_PER_TSP[yeastType] : null) : PER_TSP[kind]
  if (!per || !(grams > 0)) return null
  const n = grams / per
  if (n > 6.5) return null
  if (n < 1 / 16) return 'a small pinch'
  if (n < 3 / 32) return 'a pinch (1/16 tsp)'
  let best = FRACTIONS[0]
  for (const f of FRACTIONS) if (Math.abs(Math.log(f[0] / n)) < Math.abs(Math.log(best[0] / n))) best = f
  const near = Math.abs(best[0] - n) / n < 0.12
  return `${near ? '≈' : '~'} ${best[1]} tsp`
}

/** Whether an amount is too small to weigh well on a scale with this resolution (g). */
export const tooSmallToWeigh = (grams: number, scaleStepG: number) => grams > 0 && grams < 5 * scaleStepG

/**
 * The 1 % solution trick: dissolve 1 g in 100 g of water (from the recipe's water) and use 100× the
 * amount of solution. Returns grams of solution to use.
 */
export const solutionGrams = (grams: number) => grams * 100

export function dilutionNote(grams: number, what: string): string {
  const use = solutionGrams(grams)
  return `Too small to weigh? Stir 1 g of ${what} into 100 g of water (1 %), then use ${formatNumber(use, use < 10 ? 1 : 0)} g of that mix — and ${formatNumber(use, use < 10 ? 1 : 0)} g less water.`
}
