import type { Recipe, RecipeResult } from '../../engine/types'
import { prefermentPreset } from '../../engine/presets'

export interface WizardStep {
  key: string
  label: string
}

export function wizardSteps(r: Recipe): WizardStep[] {
  const steps: WizardStep[] = [
    { key: 'style', label: 'Style & oven' },
    { key: 'dough', label: 'Size & formula' },
    { key: 'method', label: 'Method' },
  ]
  if (r.method === 'indirect')
    r.preferments.forEach((p, i) =>
      steps.push({
        key: `pref-${p.id}`,
        label: r.preferments.length > 1 ? `${p.name || prefermentPreset(p.type).name} (${i + 1}/${r.preferments.length})` : p.name || prefermentPreset(p.type).name,
      }),
    )
  steps.push({ key: 'final', label: 'Fermentation & timing' }, { key: 'kitchen', label: 'Kitchen & water' }, { key: 'review', label: 'Review' })
  return steps
}

export interface StepProps {
  recipe: Recipe
  update: (fn: (r: Recipe) => Recipe) => void
  result: RecipeResult | null
}
