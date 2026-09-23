import { Navigate, useNavigate, useParams } from 'react-router'
import { TopBar } from '../../components/Layout'
import { Icon } from '../../components/Icon'
import { useStore, useSettings } from '../../state/store'
import { bakeDateOf, useCompute } from '../../state/hooks'
import { formatTemp, formatWeight } from '../../engine/units'
import { YEAST_SHORT } from '../../engine/yeastTypes'
import { formatDayClock } from '../../lib/time'
import { wizardSteps } from './steps'
import { StepStyle } from './StepStyle'
import { StepDough } from './StepDough'
import { StepMethod } from './StepMethod'
import { StepPreferment } from './StepPreferment'
import { StepFinal } from './StepFinal'
import { StepKitchen } from './StepKitchen'
import { StepReview } from './StepReview'
import type { Recipe } from '../../engine/types'

export function WizardPage() {
  const { step } = useParams()
  const draft = useStore((s) => s.draft)
  const recipes = useStore((s) => s.recipes)
  const updateDraft = useStore((s) => s.updateDraft)
  const saveRecipe = useStore((s) => s.saveRecipe)
  const settings = useSettings()
  const navigate = useNavigate()
  const result = useCompute(draft)

  if (!draft) return <Navigate to="/new" replace />
  const steps = wizardSteps(draft)
  const idx = steps.findIndex((s) => s.key === step)
  if (idx < 0) return <Navigate to={`/wizard/${steps[0].key}`} replace />
  const cur = steps[idx]
  const isEdit = !!recipes[draft.id]
  const update = (fn: (r: Recipe) => Recipe) => updateDraft(fn)

  const save = () => {
    const bake = bakeDateOf(draft, result)
    // The draft is kept (it now matches the saved recipe); clearing it here would race the
    // wizard's "no draft" redirect against this navigation.
    saveRecipe({ ...draft, bakeAt: bake.toISOString() })
    navigate(`/recipe/${draft.id}`, { replace: true })
  }
  const go = (i: number) => navigate(`/wizard/${steps[Math.max(0, Math.min(steps.length - 1, i))].key}`)

  const final = result?.stages.find((s) => s.id === 'final')
  const bake = bakeDateOf(draft, result)
  const start = result ? new Date(bake.getTime() - result.totalHours * 3600000) : null

  let body = null
  if (cur.key === 'style') body = <StepStyle recipe={draft} update={update} result={result} />
  else if (cur.key === 'dough') body = <StepDough recipe={draft} update={update} result={result} />
  else if (cur.key === 'method') body = <StepMethod recipe={draft} update={update} result={result} onEdit={(id) => navigate(`/wizard/pref-${id}`)} />
  else if (cur.key.startsWith('pref-'))
    body = <StepPreferment key={cur.key} prefId={cur.key.slice(5)} recipe={draft} update={update} result={result} />
  else if (cur.key === 'final') body = <StepFinal recipe={draft} update={update} result={result} />
  else if (cur.key === 'kitchen') body = <StepKitchen recipe={draft} update={update} result={result} />
  else body = <StepReview recipe={draft} update={update} result={result} />

  return (
    <>
      <TopBar
        title={isEdit ? `Edit · ${draft.name}` : 'New dough'}
        back={idx > 0 ? `/wizard/${steps[idx - 1].key}` : isEdit ? `/recipe/${draft.id}` : '/'}
        actions={
          isEdit ? (
            <button className="btn primary sm" onClick={save}>
              <Icon name="check" size={16} /> Save
            </button>
          ) : null
        }
      />
      <main className="page wizard-page">
        <div className="wizard-progress" role="tablist" aria-label="Steps">
          {steps.map((s, i) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={i === idx}
              aria-label={s.label}
              title={s.label}
              className={i === idx ? 'current' : i < idx ? 'done' : ''}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <div className="wizard-step-label">
          Step {idx + 1} of {steps.length} · {cur.label}
        </div>
        {result && (
          <div className="live-strip" aria-label="Live summary">
            <span className="ls">
              Dough <b>{formatWeight(result.totals.dough, settings.weightUnit)}</b>
            </span>
            <span className="ls">
              Flour <b>{formatWeight(result.totals.flour, settings.weightUnit)}</b>
            </span>
            {final?.waterPlan && Number.isFinite(final.waterPlan.waterC) && (
              <span className="ls">
                Water <b>{formatTemp(final.waterPlan.waterC, settings.tempUnit)}</b>
              </span>
            )}
            {result.totals.yeast > 0 && (
              <span className="ls">
                {YEAST_SHORT[draft.yeastType]} <b>{formatWeight(result.totals.yeast, settings.weightUnit)}</b>
              </span>
            )}
            {start && (
              <span className="ls">
                Start <b>{formatDayClock(start, settings.timeFormat)}</b>
              </span>
            )}
          </div>
        )}
        {body}
      </main>
      <div className="wizard-footer no-print">
        <div className="inner">
          {idx > 0 && (
            <button className="btn back" onClick={() => go(idx - 1)} aria-label="Previous step">
              <Icon name="chevronLeft" />
            </button>
          )}
          {idx < steps.length - 1 ? (
            <button className="btn primary" onClick={() => go(idx + 1)}>
              Next: {steps[idx + 1].label} <Icon name="chevronRight" size={18} />
            </button>
          ) : (
            <button className="btn primary" onClick={save}>
              <Icon name="check" size={18} /> Save & see the forecast
            </button>
          )}
        </div>
      </div>
    </>
  )
}
