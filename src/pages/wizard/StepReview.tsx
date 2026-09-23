import { AdviceList, SectionTitle } from '../../components/ui'
import { stageEmoji } from '../../components/stageMeta'
import { formatHours, formatPct, formatTemp, formatWeight } from '../../engine/units'
import { styleById } from '../../engine/presets'
import { bakeDateOf, atTime } from '../../state/hooks'
import { useSettings } from '../../state/store'
import { formatDayClock } from '../../lib/time'
import type { StepProps } from './steps'

export function StepReview({ recipe, update, result }: StepProps) {
  const settings = useSettings()
  const bake = bakeDateOf(recipe, result)
  const st = styleById(recipe.styleId)
  const u = settings.tempUnit
  const wu = settings.weightUnit
  return (
    <div className="stack">
      <h1>Your dough forecast</h1>
      <div className="card stack">
        <div className="field">
          <label htmlFor="rname">Name</label>
          <input id="rname" className="textbox" value={recipe.name} onChange={(e) => update((r) => ({ ...r, name: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rnotes">Notes</label>
          <textarea
            id="rnotes"
            className="textbox"
            placeholder="Flour brand, toppings, what to try next time…"
            value={recipe.notes}
            onChange={(e) => update((r) => ({ ...r, notes: e.target.value }))}
          />
        </div>
      </div>

      {result && (
        <>
          <div className="hero">
            <div className="muted small">
              {st.emoji} {st.name} · {result.pieces} × {formatWeight(result.pieceWeight, wu)}
            </div>
            <h2 style={{ margin: '6px 0 0' }}>Bake {formatDayClock(bake, settings.timeFormat)}</h2>
            <div className="muted small">
              Start {formatDayClock(atTime(bake, -result.totalHours), settings.timeFormat)} · {formatHours(result.totalHours)} in total
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <div className="k">Dough</div>
                <div className="v">{formatWeight(result.totals.dough, wu)}</div>
              </div>
              <div className="hero-stat">
                <div className="k">Hydration</div>
                <div className="v">{formatPct(recipe.hydration, 1)}</div>
              </div>
              <div className="hero-stat">
                <div className="k">Preferment</div>
                <div className="v">{formatPct(result.totals.prefermentedFlourPct, 0)}</div>
              </div>
            </div>
          </div>
          <SectionTitle>Stages</SectionTitle>
          <div className="stack-sm">
            {result.stages.map((s) => (
              <div key={s.id} className="card flat row">
                <span style={{ fontSize: '1.4rem' }}>{stageEmoji(s)}</span>
                <div className="grow">
                  <div style={{ fontWeight: 750 }}>{s.title}</div>
                  <div className="muted small">
                    Mix {formatDayClock(atTime(bake, s.startH), settings.timeFormat)}
                    {s.waterPlan && Number.isFinite(s.waterPlan.waterC) && ` · water ${formatTemp(s.waterPlan.waterC, u)}`}
                  </div>
                </div>
                <span className="num" style={{ fontWeight: 800 }}>
                  {formatWeight(s.totalWeight, wu)}
                </span>
              </div>
            ))}
          </div>
          <SectionTitle>Forecast notes</SectionTitle>
          {result.advice.length ? <AdviceList advice={result.advice} /> : <p className="muted">All clear — nothing to watch out for.</p>}
        </>
      )}
    </div>
  )
}
