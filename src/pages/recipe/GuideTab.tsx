import { useMemo } from 'react'
import type { Recipe, RecipeResult } from '../../engine/types'
import { buildGuide } from '../../engine/instructions'
import { atTime } from '../../state/hooks'
import { useSettings, useStore } from '../../state/store'
import { formatDayClock } from '../../lib/time'
import { formatHours } from '../../engine/units'

export function GuideTab({ recipe, result, bake, now }: { recipe: Recipe; result: RecipeResult; bake: Date; now: Date }) {
  const settings = useSettings()
  const progress = useStore((s) => s.progress[recipe.id])
  const toggleStep = useStore((s) => s.toggleStep)
  const resetProgress = useStore((s) => s.resetProgress)
  const steps = useMemo(
    () => buildGuide(recipe, result, { temp: settings.tempUnit, weight: settings.weightUnit }),
    [recipe, result, settings.tempUnit, settings.weightUnit],
  )
  const done = new Set(progress ?? [])
  const nowH = (now.getTime() - bake.getTime()) / 3600000
  const nextKey = steps.find((s) => !done.has(`step:${s.key}`))?.key

  return (
    <div className="stack">
      <div className="row between">
        <p className="muted small" style={{ margin: 0 }}>
          Tap a step when it’s done. Times follow your bake time.
        </p>
        {done.size > 0 && (
          <button className="btn ghost sm" onClick={() => resetProgress(recipe.id)}>
            Reset
          </button>
        )}
      </div>
      <ol className="steps card">
        {steps.map((s) => {
          const isDone = done.has(`step:${s.key}`)
          const at = s.atH !== undefined ? atTime(bake, s.atH) : null
          const dueIn = s.atH !== undefined ? s.atH - nowH : null
          return (
            <li
              key={s.key}
              className={isDone ? 'done' : ''}
              onClick={() => toggleStep(recipe.id, `step:${s.key}`)}
              style={{ cursor: 'pointer' }}
              aria-current={s.key === nextKey ? 'step' : undefined}
            >
              <div className="step-body">
                {at && (
                  <div className="step-when">
                    {formatDayClock(at, settings.timeFormat)}
                    {s.key === nextKey && dueIn !== null && dueIn > 0 && <span style={{ color: 'var(--primary)' }}> · in {formatHours(dueIn)}</span>}
                    {s.key === nextKey && dueIn !== null && dueIn <= 0 && <span style={{ color: 'var(--primary)' }}> · now</span>}
                  </div>
                )}
                <div className="step-title">{s.title}</div>
                <div className="step-text">
                  <ul>
                    {s.body.filter(Boolean).map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
