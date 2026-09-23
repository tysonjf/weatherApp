import { LengthField, NumberField, Segmented, WeightField } from '../../components/fields'
import { SectionTitle } from '../../components/ui'
import { styleById } from '../../engine/presets'
import { panArea, pieceWeight } from '../../engine/composition'
import type { YeastType } from '../../engine/types'
import { G_PER_CM2_PER_OZ_PER_IN2, formatNumber, formatWeight, roundTo } from '../../engine/units'
import { YEAST_LABEL } from '../../engine/yeastTypes'
import { useSettings } from '../../state/store'
import type { StepProps } from './steps'

/** Typical dough per area for round, hand-stretched pizzas (g/cm², rim included). */
const BALL_TF: Record<string, number> = {
  neapolitan: 0.34,
  canotto: 0.37,
  ny: 0.395,
  roman: 0.24,
  tavern: 0.31,
  custom: 0.35,
}

const PANS: { label: string; shape: 'rect' | 'round'; w: number; l: number; d: number }[] = [
  { label: 'Detroit 10×14″', shape: 'rect', w: 25.4, l: 35.6, d: 0 },
  { label: 'Detroit 8×10″', shape: 'rect', w: 20.3, l: 25.4, d: 0 },
  { label: 'Half sheet 18×13″', shape: 'rect', w: 33, l: 45.7, d: 0 },
  { label: 'Quarter sheet 13×9″', shape: 'rect', w: 22.9, l: 33, d: 0 },
  { label: 'Teglia 60×40', shape: 'rect', w: 40, l: 60, d: 0 },
  { label: 'Teglia 40×30', shape: 'rect', w: 30, l: 40, d: 0 },
  { label: 'Skillet 10″', shape: 'round', w: 0, l: 0, d: 25.4 },
  { label: 'Skillet 12″', shape: 'round', w: 0, l: 0, d: 30.5 },
  { label: 'Round 14″', shape: 'round', w: 0, l: 0, d: 35.6 },
]

export function StepDough({ recipe, update, result }: StepProps) {
  const { weightUnit } = useSettings()
  const st = styleById(recipe.styleId)
  const s = recipe.sizing
  const setSizing = (patch: Partial<typeof s>) => update((r) => ({ ...r, sizing: { ...r.sizing, ...patch } }))
  const tf = BALL_TF[recipe.styleId]
  const diameter = tf ? Math.sqrt((4 * s.ballWeight) / (Math.PI * tf)) : null
  const imperial = weightUnit === 'oz'
  const area = panArea(recipe)

  return (
    <div className="stack">
      <h1>How much dough?</h1>
      <div className="card stack">
        <Segmented
          ariaLabel="Sizing"
          value={s.mode}
          onChange={(mode) => setSizing({ mode })}
          options={[
            { value: 'balls', label: 'Dough balls', icon: 'pizza' },
            { value: 'pans', label: 'Pans / trays', icon: 'layers' },
          ]}
        />
        {s.mode === 'balls' ? (
          <div className="grid-2">
            <NumberField label="Balls" value={s.count} onChange={(count) => setSizing({ count })} step={1} min={1} max={200} decimals={0} />
            <WeightField
              label="Ball weight"
              grams={s.ballWeight}
              onChange={(ballWeight) => setSizing({ ballWeight })}
              step={5}
              min={50}
              max={3000}
              hint={
                <>
                  {st.ballRange && `Typical ${formatWeight(st.ballRange[0], weightUnit)}–${formatWeight(st.ballRange[1], weightUnit)}`}
                  {diameter && ` · ≈ ${imperial ? `${formatNumber(diameter / 2.54, 0)}″` : `${formatNumber(diameter, 0)} cm`} pizza`}
                </>
              }
            />
          </div>
        ) : (
          <>
            <div className="row wrap">
              {PANS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`chip${s.panShape === p.shape && (p.shape === 'round' ? s.panDiameterCm === p.d : s.panWidthCm === p.w && s.panLengthCm === p.l) ? ' on' : ''}`}
                  onClick={() =>
                    setSizing(p.shape === 'round' ? { panShape: 'round', panDiameterCm: p.d } : { panShape: 'rect', panWidthCm: p.w, panLengthCm: p.l })
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Segmented
              ariaLabel="Pan shape"
              value={s.panShape}
              onChange={(panShape) => setSizing({ panShape })}
              options={[
                { value: 'rect', label: 'Rectangular' },
                { value: 'round', label: 'Round' },
              ]}
            />
            {s.panShape === 'rect' ? (
              <div className="grid-2">
                <LengthField label="Width" cm={s.panWidthCm} onChange={(panWidthCm) => setSizing({ panWidthCm })} />
                <LengthField label="Length" cm={s.panLengthCm} onChange={(panLengthCm) => setSizing({ panLengthCm })} />
              </div>
            ) : (
              <LengthField label="Diameter" cm={s.panDiameterCm} onChange={(panDiameterCm) => setSizing({ panDiameterCm })} />
            )}
            <div className="grid-2">
              <NumberField label="Pans" value={s.count} onChange={(count) => setSizing({ count })} step={1} min={1} max={50} decimals={0} />
              {imperial ? (
                <NumberField
                  label="Thickness factor"
                  value={roundTo(s.thicknessFactor / G_PER_CM2_PER_OZ_PER_IN2, 0.001)}
                  onChange={(v) => setSizing({ thicknessFactor: roundTo(v * G_PER_CM2_PER_OZ_PER_IN2, 0.0001) })}
                  unit="oz/in²"
                  step={0.005}
                  min={0.03}
                  max={0.3}
                  decimals={3}
                />
              ) : (
                <NumberField
                  label="Thickness factor"
                  value={s.thicknessFactor}
                  onChange={(thicknessFactor) => setSizing({ thicknessFactor })}
                  unit="g/cm²"
                  step={0.01}
                  min={0.15}
                  max={1.3}
                  decimals={3}
                />
              )}
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {formatWeight(pieceWeight(recipe), weightUnit)} of dough per pan ({formatNumber(area, 0)} cm²).
              {st.tfRange && ` ${st.name}: ${st.tfRange[0]}–${st.tfRange[1]} g/cm².`}
            </p>
          </>
        )}
        <NumberField
          label="Extra for bowl & bench losses"
          value={recipe.wastePct}
          onChange={(wastePct) => update((r) => ({ ...r, wastePct }))}
          unit="%"
          step={0.5}
          min={0}
          max={25}
          hint="1–2 % with a mixer, 2–3 % by hand, more for very wet doughs."
        />
      </div>

      <SectionTitle>Formula (baker's %)</SectionTitle>
      <div className="card stack">
        <NumberField
          label="Hydration"
          value={recipe.hydration}
          onChange={(hydration) => update((r) => ({ ...r, hydration }))}
          unit="%"
          step={0.5}
          min={40}
          max={110}
          hint={`${st.name}: ${st.hydrationRange[0]}–${st.hydrationRange[1]} %`}
        />
        <input
          type="range"
          className="slider"
          aria-label="Hydration slider"
          min={45}
          max={95}
          step={0.5}
          value={recipe.hydration}
          onChange={(e) => update((r) => ({ ...r, hydration: Number(e.target.value) }))}
        />
        <div className="grid-2">
          <NumberField label="Salt" value={recipe.saltPct} onChange={(saltPct) => update((r) => ({ ...r, saltPct }))} unit="%" step={0.1} min={0} max={5} decimals={2} />
          <NumberField label="Olive oil" value={recipe.oilPct} onChange={(oilPct) => update((r) => ({ ...r, oilPct }))} unit="%" step={0.5} min={0} max={20} decimals={1} />
          <NumberField label="Sugar" value={recipe.sugarPct} onChange={(sugarPct) => update((r) => ({ ...r, sugarPct }))} unit="%" step={0.5} min={0} max={15} decimals={1} />
          <NumberField
            label="Diastatic malt"
            value={recipe.maltPct}
            onChange={(maltPct) => update((r) => ({ ...r, maltPct }))}
            unit="%"
            step={0.1}
            min={0}
            max={5}
            decimals={2}
          />
        </div>
        <div className="field">
          <span className="label">Yeast you have</span>
          <Segmented<YeastType>
            ariaLabel="Yeast type"
            value={recipe.yeastType}
            onChange={(yeastType) => update((r) => ({ ...r, yeastType }))}
            options={(['instant', 'active-dry', 'fresh'] as YeastType[]).map((t) => ({ value: t, label: YEAST_LABEL[t].replace(' yeast', '') }))}
          />
        </div>
      </div>

      {result && (
        <div className="card soft">
          <div className="kv">
            <span>Total dough</span>
            <span>{formatWeight(result.totals.dough, weightUnit)}</span>
            <span>Flour</span>
            <span>{formatWeight(result.totals.flour, weightUnit)}</span>
            <span>Water</span>
            <span>{formatWeight(result.totals.water, weightUnit)}</span>
            <span>Salt</span>
            <span>{formatWeight(result.totals.salt, weightUnit)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
