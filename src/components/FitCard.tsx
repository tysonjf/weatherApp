import { useState } from 'react'
import type { Recipe, RecipeResult } from '../engine/types'
import { clashes, fitToDay, type FitChange } from '../engine/schedule'
import { useComputeOptions, useDayPlan, useNow } from '../state/hooks'
import { useSettings } from '../state/store'
import { formatNear } from '../lib/time'
import { Alert } from './ui'
import { Icon } from './Icon'

/**
 * Flags hands-on steps that land while you sleep or work, and fits the plan around your day with one tap
 * (the bake time stays put).
 */
export function FitCard({ recipe, result, bake, onApply }: { recipe: Recipe; result: RecipeResult; bake: Date; onApply: (r: Recipe) => void }) {
  const plan = useDayPlan()
  const opts = useComputeOptions(recipe)
  const { timeFormat } = useSettings()
  const [done, setDone] = useState<{ changes: FitChange[]; left: number } | null>(null)
  const now = useNow(60000).getTime()
  const live = Object.keys(recipe.live?.mixed ?? {}).length > 0
  const bakeMs = bake.getTime()
  const upcoming = clashes(result.timeline, bakeMs, plan).filter((c) => c.atMs > now)
  if (live) return null
  if (done)
    return (
      <Alert severity={done.left ? 'warn' : 'tip'} title={done.left ? 'Partly fitted around your day' : 'Fitted around your day'}>
        {done.changes.length > 0 && (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {done.changes.map((c, i) => (
              <li key={i}>
                {c.title}: {formatNear(new Date(c.fromMs), bake, timeFormat)} → <b>{formatNear(new Date(c.toMs), bake, timeFormat)}</b>
              </li>
            ))}
          </ul>
        )}
        {done.left > 0 && <div>{done.left} step(s) can’t move far enough without spoiling the dough — try another bake time.</div>}
      </Alert>
    )
  if (!upcoming.length) return null
  return (
    <Alert severity="warn" title={`${upcoming.length} step${upcoming.length > 1 ? 's' : ''} while you ${upcoming.every((c) => c.block.kind === 'sleep') ? 'sleep' : upcoming.every((c) => c.block.kind === 'work') ? 'work' : 'sleep or work'}`}>
      <ul style={{ margin: '4px 0 6px', paddingLeft: 18 }}>
        {upcoming.map((c) => (
          <li key={c.event.id}>
            {c.event.title} at {formatNear(new Date(c.atMs), bake, timeFormat)}
          </li>
        ))}
      </ul>
      <button
        className="btn soft sm"
        onClick={() => {
          const fit = fitToDay(recipe, opts, bakeMs, plan)
          onApply({ ...fit.recipe, bakeAt: new Date(bakeMs).toISOString() })
          setDone({ changes: fit.changes, left: fit.remaining.filter((c) => c.atMs > now).length })
        }}
      >
        <Icon name="clock" size={16} /> Fit around my day
      </button>
    </Alert>
  )
}
