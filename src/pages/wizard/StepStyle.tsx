import { FLOURS, OVENS, STYLES, blendOf, flourById, ovenById } from '../../engine/presets'
import { formatTemp, localizeTemps } from '../../engine/units'
import { NumberField, SelectField, Switch } from '../../components/fields'
import { SectionTitle } from '../../components/ui'
import { applyStyle } from '../../state/recipes'
import { useSettings } from '../../state/store'
import type { StepProps } from './steps'

export function StepStyle({ recipe, update }: StepProps) {
  const settings = useSettings()
  const oven = ovenById(recipe.ovenId)
  const flour = flourById(recipe.flourId)
  const u = settings.tempUnit
  return (
    <div className="stack">
      <h1>What are we making?</h1>
      <p className="muted">Pick a style — it sets sensible starting values for everything that follows.</p>
      <div className="tiles" role="radiogroup" aria-label="Pizza style">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={recipe.styleId === s.id}
            className={`tile${recipe.styleId === s.id ? ' on' : ''}`}
            onClick={() => update((r) => (r.styleId === s.id ? r : applyStyle(r, s.id, settings)))}
          >
            <span className="t-emoji">{s.emoji}</span>
            <span className="t-title">{s.name}</span>
            <span className="t-sub">{s.blurb}</span>
          </button>
        ))}
      </div>

      <SectionTitle>Your oven</SectionTitle>
      <div className="tiles">
        {OVENS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`tile${recipe.ovenId === o.id ? ' on' : ''}`}
            onClick={() => update((r) => ({ ...r, ovenId: o.id }))}
            aria-pressed={recipe.ovenId === o.id}
          >
            <span className="t-emoji">{o.emoji}</span>
            <span className="t-title">{o.name}</span>
            <span className="t-sub">
              {formatTemp(o.tempC[0], u, 0)}–{formatTemp(o.tempC[1], u, 0)} · {localizeTemps(o.bake, u)}
            </span>
          </button>
        ))}
      </div>
      <p className="muted small">{localizeTemps(oven.blurb, u)}</p>

      <SectionTitle>Your flour</SectionTitle>
      <div className="card">
        <SelectField
          label="Flour"
          value={recipe.flourId}
          onChange={(flourId) => update((r) => ({ ...r, flourId }))}
          options={FLOURS.map((f) => ({ value: f.id, label: f.name }))}
          hint={`Protein ${flour.protein} · W ${flour.w[0]}–${flour.w[1]}. ${localizeTemps(flour.note, u)}`}
        />
        <div style={{ marginTop: 10 }}>
          <Switch
            label="Blend in a second flour"
            hint="Wholemeal, semola or a stronger flour for part of the total."
            checked={!!recipe.flour2Id}
            onChange={(v) => update((r) => ({ ...r, flour2Id: v ? 'wholemeal' : null, flour2Pct: r.flour2Pct || 20 }))}
          />
        </div>
        {recipe.flour2Id && (
          <div className="stack-sm" style={{ marginTop: 10 }}>
            <div className="grid-2">
              <SelectField
                label="Second flour"
                value={recipe.flour2Id}
                onChange={(flour2Id) => update((r) => ({ ...r, flour2Id }))}
                options={FLOURS.map((f) => ({ value: f.id, label: f.name }))}
              />
              <NumberField
                label="Share"
                value={recipe.flour2Pct ?? 20}
                onChange={(flour2Pct) => update((r) => ({ ...r, flour2Pct }))}
                unit="%"
                step={5}
                min={1}
                max={90}
                decimals={0}
              />
            </div>
            <div className="muted small">
              Blend: W ≈ {blendOf(recipe).w[0]}–{blendOf(recipe).w[1]} · protein ≈ {blendOf(recipe).proteinPct.toFixed(1)} %
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
