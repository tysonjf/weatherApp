import type { PhaseLocation, PrefermentSpec, PrefermentType } from '../../engine/types'
import { PREFERMENTS, prefermentPreset } from '../../engine/presets'
import { makePhase } from '../../engine/phases'
import { formatPct, formatTemp, localizeTemps } from '../../engine/units'
import { YEAST_LABEL, YEAST_SHORT, yeastFromFresh } from '../../engine/yeastTypes'
import { NumberField, Segmented, TempField } from '../../components/fields'
import { PhaseBar, PhaseEditor } from '../../components/PhaseEditor'
import { AdviceList, Details, SectionTitle } from '../../components/ui'
import { StageCard } from '../../components/StageCard'
import { makePreferment } from '../../state/recipes'
import { bakeDateOf } from '../../state/hooks'
import { useSettings } from '../../state/store'
import type { StepProps } from './steps'

interface PlanPreset {
  label: string
  phases: { location: PhaseLocation; hours: number; customTempC?: number }[]
  targetTempC?: number
  hydration?: number
}

function plansFor(type: PrefermentType): PlanPreset[] {
  switch (type) {
    case 'biga':
      return [
        { label: 'Classic · 18 h at 18 °C', phases: [{ location: 'custom', hours: 18, customTempC: 18 }], targetTempC: 19 },
        { label: 'Room · 16 h', phases: [{ location: 'room', hours: 16 }], targetTempC: 19 },
        { label: 'Hot kitchen · 2 h room → 22 h fridge', phases: [{ location: 'room', hours: 2 }, { location: 'fridge', hours: 22 }], targetTempC: 20 },
        {
          label: 'Long · 24 h fridge → 24 h at 18 °C',
          phases: [
            { location: 'fridge', hours: 24 },
            { location: 'custom', hours: 24, customTempC: 18 },
          ],
          targetTempC: 19,
        },
        { label: 'Cold biga · straight into the fridge 36 h', phases: [{ location: 'fridge', hours: 36 }], targetTempC: 25, hydration: 50 },
      ]
    case 'poolish':
      return [
        { label: 'Overnight · 14 h room', phases: [{ location: 'room', hours: 14 }] },
        { label: 'Fridge · 1 h room → 16 h fridge', phases: [{ location: 'room', hours: 1 }, { location: 'fridge', hours: 16 }] },
        { label: 'Fridge + wake-up · 1 h → 20 h fridge → 1 h room', phases: [{ location: 'room', hours: 1 }, { location: 'fridge', hours: 20 }, { location: 'room', hours: 1 }] },
        { label: 'Same day · 4 h room', phases: [{ location: 'room', hours: 4 }] },
      ]
    case 'lievito-madre':
    case 'licoli':
      return [
        { label: 'Warm · 4 h at 27 °C', phases: [{ location: 'custom', hours: 4, customTempC: 27 }], targetTempC: 26 },
        { label: 'Room · 5 h', phases: [{ location: 'room', hours: 5 }] },
        { label: 'Overnight · 12 h room', phases: [{ location: 'room', hours: 12 }] },
        { label: 'Slow · 2 h room → 12 h fridge', phases: [{ location: 'room', hours: 2 }, { location: 'fridge', hours: 12 }] },
      ]
    default:
      return [
        { label: 'Room · 12 h', phases: [{ location: 'room', hours: 12 }] },
        { label: 'Fridge · 1 h room → 16 h fridge', phases: [{ location: 'room', hours: 1 }, { location: 'fridge', hours: 16 }] },
        { label: 'Short · 4 h room', phases: [{ location: 'room', hours: 4 }] },
      ]
  }
}

export function StepPreferment({ prefId, recipe, update, result }: StepProps & { prefId: string }) {
  const settings = useSettings()
  const p = recipe.preferments.find((x) => x.id === prefId)
  if (!p) return <p className="muted">This preferment no longer exists.</p>
  const preset = prefermentPreset(p.type)
  const stage = result?.stages.find((s) => s.id === p.id)
  const setP = (patch: Partial<PrefermentSpec>) =>
    update((r) => ({ ...r, preferments: r.preferments.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) }))
  const u = settings.tempUnit
  const bake = bakeDateOf(recipe)
  const idx = recipe.preferments.findIndex((x) => x.id === p.id)

  return (
    <div className="stack">
      <h1>
        {preset.emoji} {p.name || preset.name}
      </h1>
      <p className="muted">{localizeTemps(preset.blurb, u)}</p>

      <div className="card stack">
        <div className="field">
          <span className="label">Type</span>
          <div className="row wrap">
            {PREFERMENTS.map((t) => (
              <button
                key={t.type}
                type="button"
                className={`chip${p.type === t.type ? ' on' : ''}`}
                onClick={() => {
                  if (t.type === p.type) return
                  const fresh = makePreferment(t.type, p.flourPct, settings)
                  setP({ ...fresh, id: p.id })
                }}
              >
                {t.emoji} {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2">
          <NumberField
            label="Share of total flour"
            value={p.flourPct}
            onChange={(flourPct) => setP({ flourPct })}
            unit="%"
            step={5}
            min={1}
            max={100}
          />
          <NumberField
            label="Hydration"
            value={p.hydration}
            onChange={(hydration) => setP({ hydration })}
            unit="%"
            step={1}
            min={30}
            max={150}
            hint={`Typical ${preset.hydrationRange[0]}–${preset.hydrationRange[1]} %`}
          />
        </div>
      </div>

      <SectionTitle>Fermentation plan</SectionTitle>
      <div className="card stack">
        <div className="row wrap">
          {plansFor(p.type).map((pl) => (
            <button
              key={pl.label}
              type="button"
              className="chip"
              onClick={() =>
                setP({
                  phases: pl.phases.map((ph) => makePhase(ph.location, ph.hours, undefined, ph.customTempC ?? 18)),
                  ...(pl.targetTempC !== undefined ? { targetTempC: pl.targetTempC } : {}),
                  ...(pl.hydration !== undefined ? { hydration: pl.hydration } : {}),
                })
              }
            >
              {localizeTemps(pl.label, u)}
            </button>
          ))}
        </div>
        <PhaseBar phases={p.phases} kitchen={recipe.kitchen} />
        <PhaseEditor phases={p.phases} onChange={(phases) => setP({ phases })} kitchen={recipe.kitchen} />
        <p className="muted small" style={{ margin: 0 }}>
          It will be ready exactly when you mix the final dough — the forecast schedules its start for you. Room and
          fridge temperatures are set in the Kitchen step.
        </p>
      </div>

      <SectionTitle>{p.leavening === 'yeast' ? 'Yeast' : 'Starter'}</SectionTitle>
      <div className="card stack">
        <Segmented
          ariaLabel="Amount"
          value={p.amountMode}
          onChange={(amountMode) => {
            // Seed the manual value with the current computed amount so switching is seamless.
            if (amountMode === 'manual' && stage)
              setP({
                amountMode,
                manualPct:
                  p.leavening === 'yeast'
                    ? Number(yeastFromFresh(stage.leavening.freshPct, recipe.yeastType).toFixed(3))
                    : Math.round(stage.leavening.starterPct),
              })
            else setP({ amountMode })
          }}
          options={[
            { value: 'auto', label: 'Calculate for my plan' },
            { value: 'manual', label: 'I’ll set it' },
          ]}
        />
        {p.amountMode === 'manual' &&
          (p.leavening === 'yeast' ? (
            <NumberField
              label={`${YEAST_LABEL[recipe.yeastType]} (% of ${p.name.toLowerCase()} flour)`}
              value={p.manualPct}
              onChange={(manualPct) => setP({ manualPct })}
              unit="%"
              step={0.05}
              min={0}
              max={5}
              decimals={3}
            />
          ) : (
            <NumberField
              label="Ripe starter (% of the fresh flour in this build)"
              value={p.manualPct}
              onChange={(manualPct) => setP({ manualPct })}
              unit="%"
              step={5}
              min={1}
              max={200}
              hint="100 % = a 1 : 1 : 1 feed, 20 % = 1 : 5 : 5."
            />
          ))}
        {stage && (
          <div className="alert tip">
            <div>
              {p.leavening === 'yeast' ? (
                <>
                  <strong>
                    {formatPct(stage.leavening.typePct)} {YEAST_SHORT[recipe.yeastType]}
                    {recipe.yeastType !== 'fresh' && ` (${formatPct(stage.leavening.freshPct)} fresh)`}
                  </strong>
                  {p.type === 'biga' && localizeTemps('Giorilli’s classic is 1 % fresh yeast for ~18 h at 18 °C; the app scales it to your plan (MasterBiga timing law).', u)}
                  {p.type === 'poolish' && localizeTemps('Scaled from the Italian poolish table (3.5 % → 1 h … 0.1 % → 16 h at 21 °C) using your real temperatures.', u)}
                  {p.type !== 'biga' && p.type !== 'poolish' && 'From Craig’s yeast model applied to this preferment’s hydration and temperatures.'}
                </>
              ) : (
                <>
                  <strong>Feed 1 : {(100 / Math.max(1, stage.leavening.starterPct)).toFixed(1)} : {((100 / Math.max(1, stage.leavening.starterPct)) * (p.hydration / 100)).toFixed(1)}</strong>
                  Starter : flour : water, so it peaks exactly when you mix the final dough.
                </>
              )}
              {Math.abs(stage.ripeness - 1) > 0.15 && (
                <div style={{ marginTop: 4 }}>
                  Ripeness at use: <b>{Math.round(stage.ripeness * 100)} %</b>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Details summary="Extras: salt, honey, mixing temperature" icon="sliders">
        <div className="stack">
          <div className="grid-2">
            <NumberField label="Salt" value={p.saltPct} onChange={(saltPct) => setP({ saltPct })} unit="%" step={0.1} min={0} max={3} decimals={2} hint="0.1–0.2 % slows a biga in summer." />
            <NumberField label="Honey / malt" value={p.honeyPct} onChange={(honeyPct) => setP({ honeyPct })} unit="%" step={0.5} min={0} max={5} decimals={1} hint="≈ 1 % is a popular poolish kick-start." />
          </div>
          {p.leavening === 'sourdough' && (
            <NumberField
              label="Your starter's hydration"
              value={p.seedHydration}
              onChange={(seedHydration) => setP({ seedHydration })}
              unit="%"
              step={5}
              min={40}
              max={150}
            />
          )}
          <TempField
            label="Temperature at the end of mixing"
            valueC={p.targetTempC}
            onChangeC={(targetTempC) => setP({ targetTempC })}
            minC={10}
            maxC={32}
            hint={localizeTemps(p.type === 'biga' ? 'Biga: 18–21 °C (25–26 °C for a biga going straight into the fridge).' : 'Poolish 20–23 °C; sourdough builds 24–27 °C.', u)}
          />
          <div className="field">
            <label htmlFor={`pf-name-${p.id}`}>Name (shown in the recipe)</label>
            <input
              id={`pf-name-${p.id}`}
              className="textbox"
              value={p.name}
              placeholder={`${preset.name} ${idx + 1}`}
              onChange={(e) => setP({ name: e.target.value })}
            />
          </div>
        </div>
      </Details>

      {result && <AdviceList advice={result.advice} scope={p.id} />}
      {stage && <StageCard stage={stage} recipe={recipe} bake={bake} />}
      {stage?.waterPlan && (
        <p className="muted small">
          Mix to about {formatTemp(p.targetTempC, u, 0)}; it will be about {formatTemp(stage.endTempC, u, 0)} when it goes into the final dough.
        </p>
      )}
    </div>
  )
}
