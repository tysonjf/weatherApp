import { useCallback, useMemo, type ReactNode } from 'react'
import type { Advice, Recipe, RecipeResult } from '../engine/types'
import { balanceFixes, bigaSplitFix, type BalanceFix } from '../engine/balance'
import { bakeDateOf, useComputeOptions } from '../state/hooks'
import { FixButtons } from './Fixes'

/**
 * Buttons for the advice the app can fix: an over- or under-fermenting final dough, a biga that needs
 * too much yeast. Pass the result as `action` to AdviceList.
 */
export function useAdviceActions(recipe: Recipe | null, result: RecipeResult | null, apply: (r: Recipe) => void) {
  const opts = useComputeOptions(recipe)
  const bakeAtMs = recipe ? bakeDateOf(recipe).getTime() : 0
  const fixable = result?.advice.some((a) => a.id) ?? false
  const fixes = useMemo(() => {
    if (!recipe || !result || !fixable) return { balance: [] as BalanceFix[], split: {} as Record<string, BalanceFix | null> }
    const o = { ...opts, bakeAtMs }
    const split: Record<string, BalanceFix | null> = {}
    for (const a of result.advice) if (a.id === 'biga-split') split[a.scope] = bigaSplitFix(recipe, a.scope, o)
    return { balance: balanceFixes(recipe, result, o), split }
  }, [recipe, result, fixable, opts, bakeAtMs])
  return useCallback(
    (a: Advice): ReactNode => {
      if (a.id === 'final-over' || a.id === 'final-under') return <FixButtons fixes={fixes.balance} onApply={apply} />
      if (a.id === 'biga-split') {
        const f = fixes.split[a.scope]
        return f ? <FixButtons fixes={[f]} onApply={apply} /> : null
      }
      return null
    },
    [fixes, apply],
  )
}
