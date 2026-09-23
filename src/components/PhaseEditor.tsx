import type { KitchenSpec, Phase, PhaseLocation } from '../engine/types'
import { makePhase, phaseTempC } from '../engine/phases'
import { formatHours, formatTemp } from '../engine/units'
import { useSettings } from '../state/store'
import { NumberField, Segmented, TempField } from './fields'
import { Icon } from './Icon'

const LOCATIONS: { value: PhaseLocation; label: string; icon: 'sun' | 'snow' | 'thermo' }[] = [
  { value: 'room', label: 'Room', icon: 'sun' },
  { value: 'fridge', label: 'Fridge', icon: 'snow' },
  { value: 'custom', label: 'Set temp', icon: 'thermo' },
]

/** Editable list of fermentation phases (room / fridge / controlled temperature). */
export function PhaseEditor({
  phases,
  onChange,
  kitchen,
  withStages,
  minPhases = 1,
}: {
  phases: Phase[]
  onChange: (phases: Phase[]) => void
  kitchen: Pick<KitchenSpec, 'roomC' | 'fridgeC'>
  /** Final dough: show the bulk / balls toggle. */
  withStages?: boolean
  minPhases?: number
}) {
  const { tempUnit } = useSettings()
  const update = (i: number, patch: Partial<Phase>) =>
    onChange(phases.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const remove = (i: number) => onChange(phases.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= phases.length) return
    const next = [...phases]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="stack-sm">
      {phases.map((p, i) => {
        const t = phaseTempC(p, kitchen)
        return (
          <div className="phase" key={p.id}>
            <div className="phase-head">
              <span className={`badge ${p.location === 'fridge' ? 'cold' : p.location === 'room' ? 'warm' : 'basil'}`}>
                <Icon name={p.location === 'fridge' ? 'snow' : p.location === 'room' ? 'sun' : 'thermo'} size={14} />
                {formatTemp(t, tempUnit, 0)}
              </span>
              <span>
                {withStages ? (p.stage === 'balls' ? 'Balls' : 'Bulk') : `Phase ${i + 1}`} · {formatHours(p.hours)}
              </span>
              <span className="row" style={{ marginLeft: 'auto', gap: 2 }}>
                {phases.length > 1 && (
                  <>
                    <button className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      <Icon name="chevronUp" size={18} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Move down"
                      onClick={() => move(i, 1)}
                      disabled={i === phases.length - 1}
                    >
                      <Icon name="chevronDown" size={18} />
                    </button>
                  </>
                )}
                {phases.length > minPhases && (
                  <button className="icon-btn" aria-label="Remove phase" onClick={() => remove(i)}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </span>
            </div>
            {withStages && (
              <Segmented
                ariaLabel="Stage"
                value={p.stage ?? 'bulk'}
                onChange={(stage) => update(i, { stage })}
                options={[
                  { value: 'bulk', label: 'Bulk (puntata)' },
                  { value: 'balls', label: 'Balls (appretto)' },
                ]}
              />
            )}
            <Segmented
              ariaLabel="Where"
              value={p.location}
              onChange={(location) => update(i, { location })}
              options={LOCATIONS}
            />
            <div className="grid-2">
              <NumberField
                label="Hours"
                value={p.hours}
                onChange={(hours) => update(i, { hours })}
                unit="h"
                step={p.hours < 3 ? 0.25 : 1}
                min={0}
                max={240}
                decimals={2}
              />
              {p.location === 'custom' ? (
                <TempField label="Temperature" valueC={p.customTempC} onChangeC={(c) => update(i, { customTempC: c })} minC={-2} maxC={40} />
              ) : (
                <div className="field">
                  <span className="label">Temperature</span>
                  <div className="muted small" style={{ paddingTop: 12 }}>
                    {p.location === 'room' ? 'Room' : 'Fridge'} {formatTemp(t, tempUnit)} — set in Kitchen
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
      <div className="row wrap">
        {(withStages
          ? [
              { label: 'Bulk at room', loc: 'room' as const, stage: 'bulk' as const, h: 2 },
              { label: 'Bulk in fridge', loc: 'fridge' as const, stage: 'bulk' as const, h: 24 },
              { label: 'Balls at room', loc: 'room' as const, stage: 'balls' as const, h: 4 },
              { label: 'Balls in fridge', loc: 'fridge' as const, stage: 'balls' as const, h: 24 },
            ]
          : [
              { label: 'Room phase', loc: 'room' as const, stage: undefined, h: 2 },
              { label: 'Fridge phase', loc: 'fridge' as const, stage: undefined, h: 12 },
              { label: 'Controlled temp', loc: 'custom' as const, stage: undefined, h: 12 },
            ]
        ).map((b) => (
          <button
            key={b.label}
            type="button"
            className="chip"
            onClick={() => {
              const ph = makePhase(b.loc, b.h, b.stage)
              if (withStages && b.stage === 'bulk') {
                // Bulk phases belong before the first ball phase.
                const firstBall = phases.findIndex((p) => p.stage === 'balls')
                const next = [...phases]
                next.splice(firstBall === -1 ? phases.length : firstBall, 0, ph)
                onChange(next)
              } else onChange([...phases, ph])
            }}
          >
            <Icon name="plus" size={14} />
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A compact weather-strip style bar showing where the time is spent. */
export function PhaseBar({
  phases,
  kitchen,
}: {
  phases: Phase[]
  kitchen: Pick<KitchenSpec, 'roomC' | 'fridgeC'>
}) {
  const { tempUnit } = useSettings()
  const total = phases.reduce((s, p) => s + p.hours, 0) || 1
  return (
    <div>
      <div className="ferm-bar" aria-hidden="true">
        {phases.map((p) => (
          <div
            key={p.id}
            className={p.location}
            style={{ flexGrow: p.hours / total, flexBasis: 0 }}
            title={`${formatHours(p.hours)} at ${formatTemp(phaseTempC(p, kitchen), tempUnit, 0)}`}
          >
            {p.hours / total > 0.14 ? `${formatHours(p.hours)} · ${formatTemp(phaseTempC(p, kitchen), tempUnit, 0)}` : ''}
          </div>
        ))}
      </div>
      <div className="ferm-legend">
        <span>Start</span>
        <span>{formatHours(total)}</span>
      </div>
    </div>
  )
}
