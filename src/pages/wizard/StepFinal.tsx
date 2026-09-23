import { SCHEDULES } from '../../engine/presets'
import { makePhase } from '../../engine/phases'
import { formatHours, formatPct } from '../../engine/units'
import { YEAST_LABEL, YEAST_SHORT, yeastFromFresh } from '../../engine/yeastTypes'
import { NumberField, Segmented } from '../../components/fields'
import { PhaseBar, PhaseEditor } from '../../components/PhaseEditor'
import { AdviceList, Alert, Details, SectionTitle } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { bakeDateOf, useNow } from '../../state/hooks'
import { useSettings } from '../../state/store'
import { defaultBakeTime, formatDayClock, fromLocalInput, roundUp5, toLocalInput } from '../../lib/time'
import type { StepProps } from './steps'
import { useAdviceActions } from '../../components/useAdviceActions'

const TARGETS = [
  { value: '0.8', label: 'Young' },
  { value: '1', label: 'Standard' },
  { value: '1.3', label: 'Fuller' },
  { value: '1.6', label: 'Max puff' },
]

export function StepFinal({ recipe, update, result }: StepProps) {
  const settings = useSettings()
  const action = useAdviceActions(recipe, result, (next) => update(() => next))
  const now = useNow(60000)
  const f = recipe.final
  const setF = (patch: Partial<typeof f>) => update((r) => ({ ...r, final: { ...r.final, ...patch } }))
  const stage = result?.stages.find((s) => s.id === 'final')
  const bake = bakeDateOf(recipe)
  const start = result ? new Date(bake.getTime() - result.totalHours * 3600000) : null
  const late = start ? start.getTime() < now.getTime() - 5 * 60000 : false
  const targetKey = TARGETS.find((t) => Math.abs(Number(t.value) - f.proofTarget) < 0.01)?.value ?? 'custom'
  const indirect = recipe.method === 'indirect'
  const sourdough = recipe.method === 'direct' && recipe.directLeavening === 'sourdough'

  return (
    <div className="stack">
      <h1>{indirect ? 'Final dough fermentation' : 'Fermentation plan'}</h1>
      <p className="muted">Bulk (puntata) happens before balling, the ball proof (appretto) after. Mix and match room and fridge.</p>

      <div className="card stack">
        <div className="row wrap">
          {SCHEDULES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              title={s.blurb}
              onClick={() => setF({ phases: s.phases.map((p) => makePhase(p.location, p.hours, p.stage)) })}
            >
              {s.name}
            </button>
          ))}
        </div>
        <PhaseBar phases={f.phases} kitchen={recipe.kitchen} />
        <PhaseEditor phases={f.phases} onChange={(phases) => setF({ phases })} kitchen={recipe.kitchen} withStages />
      </div>

      <SectionTitle>When do you want to eat?</SectionTitle>
      <div className="card stack">
        <div className="field">
          <label htmlFor="bake-at">Pizzas go in the oven</label>
          <input
            id="bake-at"
            className="textbox"
            type="datetime-local"
            value={toLocalInput(bake)}
            onChange={(e) => {
              const d = fromLocalInput(e.target.value)
              if (d) update((r) => ({ ...r, bakeAt: d.toISOString() }))
            }}
          />
        </div>
        <div className="row wrap">
          <button
            type="button"
            className="chip"
            onClick={() => result && update((r) => ({ ...r, bakeAt: roundUp5(new Date(Date.now() + result.totalHours * 3600000)).toISOString() }))}
          >
            <Icon name="play" size={14} /> Start now
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => result && update((r) => ({ ...r, bakeAt: defaultBakeTime(result.totalHours + 0.25).toISOString() }))}
          >
            <Icon name="calendar" size={14} /> Next dinner time
          </button>
        </div>
        {start && (
          <div className="kv">
            <span>First step</span>
            <span>{formatDayClock(start, settings.timeFormat)}</span>
            <span>Total time</span>
            <span>{formatHours(result!.totalHours)}</span>
          </div>
        )}
        {late && (
          <Alert severity="warn" title="That start time has already passed">
            Pick a later bake time, tap “Start now”, or shorten the plan.
          </Alert>
        )}
      </div>

      <SectionTitle>Leavening</SectionTitle>
      <div className="card stack">
        {sourdough ? (
          <>
            <Segmented
              ariaLabel="Starter amount"
              value={recipe.starterMode}
              onChange={(starterMode) =>
                update((r) => ({
                  ...r,
                  starterMode,
                  starterPct: starterMode === 'manual' && stage ? Math.round(stage.leavening.starterPct * 10) / 10 : r.starterPct,
                }))
              }
              options={[
                { value: 'auto', label: 'Calculate starter' },
                { value: 'manual', label: 'I’ll set it' },
              ]}
            />
            {recipe.starterMode === 'manual' && (
              <NumberField
                label="Ripe starter (% of total flour)"
                value={recipe.starterPct}
                onChange={(starterPct) => update((r) => ({ ...r, starterPct }))}
                unit="%"
                step={1}
                min={0.5}
                max={60}
              />
            )}
            <NumberField
              label="Starter hydration"
              value={recipe.starterHydration}
              onChange={(starterHydration) => update((r) => ({ ...r, starterHydration }))}
              unit="%"
              step={5}
              min={40}
              max={150}
            />
            {stage && (
              <Alert severity="tip" title={`${formatPct(stage.leavening.starterPct, 1)} ripe starter on flour`}>
                From Craig’s sourdough chart, integrated over your temperatures. Feed the starter so it peaks at mixing time.
              </Alert>
            )}
          </>
        ) : (
          <>
            <Segmented
              ariaLabel={indirect ? 'Extra yeast' : 'Yeast'}
              value={f.extraYeastMode === 'none' && !indirect ? 'auto' : f.extraYeastMode}
              onChange={(extraYeastMode) =>
                setF({
                  extraYeastMode,
                  extraYeastPct:
                    extraYeastMode === 'manual' && stage ? Number(yeastFromFresh(stage.leavening.freshPct, recipe.yeastType).toFixed(3)) : f.extraYeastPct,
                })
              }
              options={
                indirect
                  ? [
                      { value: 'auto', label: 'Top up if needed' },
                      { value: 'none', label: 'None' },
                      { value: 'manual', label: 'I’ll set it' },
                    ]
                  : [
                      { value: 'auto', label: 'Calculate yeast' },
                      { value: 'manual', label: 'I’ll set it' },
                    ]
              }
            />
            {f.extraYeastMode === 'manual' && (
              <NumberField
                label={`${YEAST_LABEL[recipe.yeastType]} (% of total flour)`}
                value={f.extraYeastPct}
                onChange={(extraYeastPct) => setF({ extraYeastPct })}
                unit="%"
                step={0.01}
                min={0}
                max={5}
                decimals={3}
              />
            )}
            {stage && (
              <Alert severity={stage.leavening.freshPct > 0 ? 'tip' : 'info'} title={
                stage.leavening.freshPct > 0
                  ? `${formatPct(stage.leavening.typePct)} ${YEAST_SHORT[recipe.yeastType]}${recipe.yeastType !== 'fresh' ? ` (${formatPct(stage.leavening.freshPct)} fresh)` : ''}`
                  : 'No extra yeast'
              }>
                {indirect
                  ? 'The ripe preferments carry most of the leavening; the app only tops up what the final fermentation still needs.'
                  : 'Solved from Craig’s fermentation model over the simulated dough temperature, including time for the dough to chill in the fridge.'}
                {Math.abs(stage.ripeness - 1) > 0.12 && (
                  <div>
                    Expected ripeness at bake time: <b>{Math.round(stage.ripeness * 100)} %</b>
                  </div>
                )}
              </Alert>
            )}
          </>
        )}
        <div className="field">
          <span className="label">How far to proof</span>
          <Segmented
            ariaLabel="Proof target"
            value={targetKey}
            onChange={(v) => v !== 'custom' && setF({ proofTarget: Number(v) })}
            options={TARGETS}
          />
          <span className="hint">
            Standard = about doubled (Craig’s end point). Pan styles like Detroit and focaccia proof fuller.
          </span>
        </div>
      </div>

      <Details summary="Mixing, autolyse & folds" icon="bowl">
        <div className="grid-2">
          <NumberField
            label="Autolyse"
            value={f.autolyseMin ?? 0}
            onChange={(autolyseMin) => setF({ autolyseMin })}
            unit="min"
            step={5}
            min={0}
            max={180}
            decimals={0}
            hint="Flour + water rest before mixing (0 = none). 20–45 min helps high hydration and semola."
          />
          <div />
          <NumberField
            label="Stretch & folds"
            value={f.folds ?? 0}
            onChange={(folds) => setF({ folds })}
            unit="sets"
            step={1}
            min={0}
            max={8}
            decimals={0}
          />
          <NumberField
            label="Every"
            value={f.foldEveryMin ?? 30}
            onChange={(foldEveryMin) => setF({ foldEveryMin })}
            unit="min"
            step={5}
            min={10}
            max={90}
            decimals={0}
            hint="During the bulk; each set is a reminder in the timeline."
          />
          <NumberField
            label="Mixing & kneading"
            value={f.mixMinutes}
            onChange={(mixMinutes) => setF({ mixMinutes })}
            unit="min"
            step={5}
            min={0}
            max={120}
            decimals={0}
          />
          <NumberField
            label="Water held back"
            value={f.reservePct}
            onChange={(reservePct) => setF({ reservePct })}
            unit="%"
            step={1}
            min={0}
            max={40}
            decimals={0}
            hint="Bassinage, % of the final-dough water."
          />
        </div>
      </Details>

      {result && <AdviceList advice={result.advice} scope="final" action={action} />}
    </div>
  )
}
