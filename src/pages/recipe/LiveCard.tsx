import { useMemo, useState } from 'react'
import type { Recipe, RecipeResult } from '../../engine/types'
import { activeStage, applyRiseReading, markMixed, replan, riseForRipeness, ripenessAt } from '../../engine/replan'
import { formatNumber, formatTemp } from '../../engine/units'
import { NumberField, Switch, TempField } from '../../components/fields'
import { Alert, Sheet } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { atTime, useComputeOptions } from '../../state/hooks'
import { useSettings, useStore } from '../../state/store'
import { formatDayClock, formatNear, fromLocalInput, roundUp5, toLocalInput } from '../../lib/time'

const H = 3600000
const pct = (r: number) => `${Math.round(r * 100)} %`

/** Status of a dough that is being made: how ripe it is now and whether it is on time. */
export function LiveCard({ recipe, result, bake, now }: { recipe: Recipe; result: RecipeResult; bake: Date; now: Date }) {
  const { timeFormat } = useSettings()
  const [sheet, setSheet] = useState<'jar' | 'replan' | null>(null)
  const nowH = (now.getTime() - bake.getTime()) / H
  const stageId = activeStage(recipe, nowH)
  if (!stageId || nowH > 3) return null
  const stage = result.stages.find((s) => s.id === stageId)
  if (!stage) return null
  const rNow = ripenessAt(stage, nowH)
  const isFinal = stageId === 'final'
  const w = result.window
  const clock = (h: number) => formatNear(atTime(bake, h), now, timeFormat)
  let status: string
  let tone: 'basil' | 'warm' | 'cold' = 'basil'
  if (isFinal) {
    if (w.bestH === null) {
      status = `Slow: ${pct(stage.ripeness)} at the bake`
      tone = 'cold'
    } else if (Math.abs(w.bestH) <= 0.25) status = `On time for ${clock(0)}`
    else if (w.bestH < 0) {
      status = `Running early: best at ${clock(w.bestH)}`
      tone = 'warm'
    } else {
      status = `Running late: best at ${clock(w.bestH)}`
      tone = 'cold'
    }
  } else {
    const off = stage.ripeness - 1
    status = Math.abs(off) < 0.05 ? 'On time for the final mix' : `${pct(stage.ripeness)} ripe at the final mix`
    tone = Math.abs(off) < 0.05 ? 'basil' : off > 0 ? 'warm' : 'cold'
  }

  return (
    <div className="card live-card" style={{ marginTop: 12 }}>
      <div className="row between">
        <div>
          <span className="badge hot">● Live</span> <b>{stage.title}</b>
        </div>
        <span className={`badge ${tone}`}>{pct(rNow)} ripe</span>
      </div>
      <div className="meter" style={{ margin: '10px 0 6px' }} aria-hidden="true">
        <span style={{ width: `${Math.min(100, (rNow / (isFinal ? 1.3 : 1.2)) * 100)}%` }} />
      </div>
      <div className="small">{status}</div>
      {isFinal && Math.abs((recipe.final.activity ?? 1) - 1) >= 0.05 && (
        <div className="muted small">From your sample jar: fermenting {Math.round((recipe.final.activity ?? 1) * 100)} % of the forecast speed.</div>
      )}
      {isFinal && w.readyH !== null && (
        <div className="muted small">
          Bakes well {clock(w.readyH)} – {w.untilH === null ? 'late' : clock(w.untilH)}
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
        {isFinal && (
          <button className="btn soft sm" onClick={() => setSheet('jar')}>
            <Icon name="scale" size={16} /> Sample jar reading
          </button>
        )}
        <button className="btn soft sm" onClick={() => setSheet('replan')}>
          <Icon name="clock" size={16} /> Plans changed?
        </button>
      </div>
      {sheet === 'jar' && <JarSheet recipe={recipe} result={result} bake={bake} now={now} onClose={() => setSheet(null)} />}
      {sheet === 'replan' && <ReplanSheet recipe={recipe} bake={bake} now={now} onClose={() => setSheet(null)} />}
    </div>
  )
}

/** Confirms that a stage was mixed: when, and (optionally) the measured dough temperature. */
export function MixedSheet({
  recipe,
  result,
  stageId,
  bake,
  onClose,
  onSaved,
}: {
  recipe: Recipe
  result: RecipeResult
  stageId: string
  bake: Date
  onClose: () => void
  onSaved: () => void
}) {
  const saveRecipe = useStore((s) => s.saveRecipe)
  const { tempUnit } = useSettings()
  const stage = result.stages.find((s) => s.id === stageId)
  const [at, setAt] = useState(() => roundUp5(new Date(Date.now() - 4 * 60000)))
  const [measured, setMeasured] = useState(false)
  const [tempC, setTempC] = useState(stage?.mixTempC ?? 24)
  if (!stage) return null
  const save = () => {
    saveRecipe(markMixed(recipe, result, stageId, at.getTime(), measured ? tempC : null, bake.getTime()))
    onSaved()
  }
  return (
    <Sheet open onClose={onClose} title={`${stage.title}: mixed`}>
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          The yeast and starter amounts are locked in, and the forecast follows your dough from here on. Everything
          after this keeps its clock time.
        </p>
        <div className="field">
          <label htmlFor="mixed-at">Finished mixing at</label>
          <input
            id="mixed-at"
            className="textbox"
            type="datetime-local"
            value={toLocalInput(at)}
            onChange={(e) => {
              const d = fromLocalInput(e.target.value)
              if (d) setAt(d)
            }}
          />
        </div>
        <Switch
          label="I measured the dough temperature"
          hint={`The plan expects ${formatTemp(stage.mixTempC, tempUnit)}. A probe in the middle of the dough right after mixing makes the forecast much sharper.`}
          checked={measured}
          onChange={setMeasured}
        />
        {measured && <TempField label="Dough temperature" valueC={tempC} onChangeC={setTempC} minC={5} maxC={40} />}
        <button className="btn primary block" onClick={save}>
          <Icon name="check" size={18} /> Save
        </button>
      </div>
    </Sheet>
  )
}

function JarSheet({ recipe, result, bake, now, onClose }: { recipe: Recipe; result: RecipeResult; bake: Date; now: Date; onClose: () => void }) {
  const saveRecipe = useStore((s) => s.saveRecipe)
  const final = result.stages.find((s) => s.id === 'final')!
  const nowH = (now.getTime() - bake.getTime()) / H
  const target = Math.max(0.5, recipe.final.proofTarget || 1)
  const expected = riseForRipeness(ripenessAt(final, nowH), target)
  const [rise, setRise] = useState(Math.round(expected / 5) * 5)
  const [msg, setMsg] = useState<string | null>(null)
  const save = () => {
    const out = applyRiseReading(recipe, result, rise, now.getTime(), bake.getTime())
    saveRecipe(out.recipe)
    const speed = out.activity
    if (out.ignored) {
      setMsg('Too early to tell — the first few millimetres say little. Check again once it has risen about 20–30 %.')
      return
    }
    setMsg(
      `${Math.abs(speed - 1) < 0.05 ? 'Right on the forecast.' : `Running ${Math.round(Math.abs(speed - 1) * 100)} % ${speed > 1 ? 'faster' : 'slower'} than the forecast — the plan now follows your dough.`}${out.reliable ? '' : ' Early readings count half: check again later to firm it up.'}`,
    )
  }
  return (
    <Sheet open onClose={onClose} title="Sample jar">
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          Right after mixing, drop 20–40 g of the dough into a straight-sided jar, press it flat and mark the level.
          The jar rises like your dough, so it tells you how far along it really is.
        </p>
        <Alert severity="info" title={`The forecast expects about ${formatNumber(expected, 0)} % rise by now`}>
          100 % = doubled.
        </Alert>
        <NumberField label="How much has it risen?" value={rise} onChange={setRise} unit="%" step={5} min={0} max={400} decimals={0} />
        {msg ? (
          <>
            <Alert severity="tip" title="Updated">
              {msg}
            </Alert>
            <button className="btn block" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <button className="btn primary block" onClick={save}>
            <Icon name="check" size={18} /> Update the forecast
          </button>
        )}
      </div>
    </Sheet>
  )
}

function ReplanSheet({ recipe, bake, now, onClose }: { recipe: Recipe; bake: Date; now: Date; onClose: () => void }) {
  const saveRecipe = useStore((s) => s.saveRecipe)
  const { timeFormat } = useSettings()
  const opts = useComputeOptions(recipe)
  const [target, setTarget] = useState(bake)
  const plan = useMemo(
    () => replan({ ...recipe, bakeAt: bake.toISOString() }, opts, now.getTime(), target.getTime()),
    [recipe, bake, opts, now, target],
  )
  return (
    <Sheet open onClose={onClose} title="Plans changed?">
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          Pick when you want to bake. The dough’s yeast is already in, so the fixes use time and temperature — and
          nothing that already happened moves.
        </p>
        <div className="field">
          <label htmlFor="replan-bake">Bake at</label>
          <input
            id="replan-bake"
            className="textbox"
            type="datetime-local"
            value={toLocalInput(target)}
            onChange={(e) => {
              const d = fromLocalInput(e.target.value)
              if (d && d.getTime() > now.getTime()) setTarget(d)
            }}
          />
        </div>
        {!plan ? (
          <p className="muted">Mark a stage as mixed in the bake guide to use this.</p>
        ) : (
          <div className="stack-sm">
            {plan.options.map((o) => (
              <div key={o.id} className="card soft">
                <div className="row between">
                  <b>{o.title}</b>
                  <span className={`badge ${Math.abs(o.ripeness - 1) < 0.05 ? 'basil' : Math.abs(o.ripeness - 1) < 0.2 ? 'warm' : 'hot'}`}>
                    {pct(o.ripeness)}
                  </span>
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {o.nextStepAtMs !== undefined && <>Next step at {formatDayClock(new Date(o.nextStepAtMs), timeFormat)}. </>}
                  {o.bakeAtMs !== undefined && <>Bake at {formatDayClock(new Date(o.bakeAtMs), timeFormat)}. </>}
                  {o.detail}
                </div>
                <button
                  className={`btn sm ${Math.abs(o.ripeness - 1) < 0.05 ? 'primary' : 'soft'}`}
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    saveRecipe(o.recipe)
                    onClose()
                  }}
                >
                  Use this
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
