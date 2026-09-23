import type { IngredientKind, Recipe, StageResult } from '../engine/types'
import { prefermentPreset } from '../engine/presets'
import { formatPct, formatTemp, formatWeight } from '../engine/units'
import { YEAST_SHORT } from '../engine/yeastTypes'
import { useSettings } from '../state/store'
import { atTime } from '../state/hooks'
import { formatDayClock } from '../lib/time'
import { Icon } from './Icon'
import { stageColorClass, stageEmoji } from './stageMeta'

const KIND_EMOJI: Record<IngredientKind, string> = {
  flour: '🌾',
  water: '💧',
  ice: '🧊',
  salt: '🧂',
  yeast: '🫧',
  starter: '🫙',
  oil: '🫒',
  sugar: '🍬',
  malt: '🍺',
  honey: '🍯',
  preferment: '🥣',
}

export function StageCard({
  stage,
  recipe,
  bake,
  checked,
  onToggle,
}: {
  stage: StageResult
  recipe: Recipe
  bake: Date
  checked?: Set<string>
  onToggle?: (key: string) => void
}) {
  const { tempUnit, weightUnit, timeFormat, showClassicDdt } = useSettings()
  const u = tempUnit
  const w = stage.waterPlan
  const lv = stage.leavening
  const when = atTime(bake, stage.startH)
  const prefEmoji = (key: string) => {
    const id = key.replace(/^pref-/, '')
    const p = recipe.preferments.find((x) => x.id === id)
    return p ? prefermentPreset(p.type).emoji : '🥣'
  }

  return (
    <section className={`card stage-card ${stageColorClass(stage)}`}>
      <div className="card-head">
        <span style={{ fontSize: '1.5rem' }}>{stageEmoji(stage)}</span>
        <div className="grow">
          <h3>{stage.title}</h3>
          <div className="muted small">{stage.subtitle}</div>
        </div>
        <span className="badge" title="When to mix">
          <Icon name="clock" size={13} />
          {formatDayClock(when, timeFormat)}
        </span>
      </div>

      <ul className="ing-list">
        {stage.ingredients.map((l) => {
          const key = `${stage.id}:${l.key}`
          const isChecked = checked?.has(key)
          return (
            <li
              key={l.key}
              className={isChecked ? 'checked' : ''}
              onClick={onToggle ? () => onToggle(key) : undefined}
              style={onToggle ? { cursor: 'pointer' } : undefined}
            >
              <span className="ing-icon" aria-hidden="true">
                {l.kind === 'preferment' ? prefEmoji(l.key) : KIND_EMOJI[l.kind]}
              </span>
              <span>
                <div className="ing-name">{l.label}</div>
                {l.note && <div className="ing-note">{l.note}</div>}
              </span>
              <span className="ing-qty">
                {formatWeight(l.grams, weightUnit)}
                {l.pct !== undefined && <span className="ing-pct">{formatPct(l.pct)}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="ing-total">
        <span>Total</span>
        <span className="num">{formatWeight(stage.kind === 'final' ? stage.totalWeight : stage.totalWeight, weightUnit)}</span>
      </div>

      {w && Number.isFinite(w.waterC) && (
        <div className="water-box">
          <span className="wt">{formatTemp(w.waterC, u)}</span>
          <span className="small">
            <b>Water temperature</b>
            {w.iceG > 0.5 && <> · with {formatWeight(w.iceG, weightUnit)} ice</>}
          </span>
          <span className="small muted">
            Dough {w.status === 'ok' || w.status === 'ice' ? 'will finish at' : 'will reach'} {formatTemp(w.expectedC, u)}
            {w.status !== 'ok' && w.status !== 'ice' && <> (target {formatTemp(w.targetC, u)})</>}
            {showClassicDdt && <> · classic rule: {formatTemp(w.classicWaterC, u)}</>}
          </span>
        </div>
      )}

      <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
        {lv.kind === 'yeast' && (
          <span className="badge primary">
            {formatPct(lv.typePct)} {YEAST_SHORT[recipe.yeastType]}
            {recipe.yeastType !== 'fresh' && <> · {formatPct(lv.freshPct)} fresh</>}
          </span>
        )}
        {lv.kind === 'sourdough' && lv.starterPct > 0 && (
          <span className="badge primary">
            {stage.kind === 'preferment' ? `Seed ${formatPct(lv.starterPct, 0)} of fresh flour` : `Starter ${formatPct(lv.starterPct, 1)}`}
          </span>
        )}
        {lv.kind === 'none' && stage.kind === 'final' && <span className="badge basil">No extra yeast</span>}
        <span className="badge">
          {stage.phases.some((p) => p.location === 'fridge') && <Icon name="snow" size={13} />}
          ends at {formatTemp(stage.endTempC, u, 0)}
        </span>
        {Math.abs(stage.ripeness - 1) > 0.12 && stage.ripeness > 0 && (
          <span className={`badge ${stage.ripeness > 1 ? 'hot' : 'cold'}`}>ripeness {Math.round(stage.ripeness * 100)} %</span>
        )}
      </div>
    </section>
  )
}
