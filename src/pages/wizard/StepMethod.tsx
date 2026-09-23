import { PREFERMENTS, prefermentPreset } from '../../engine/presets'
import type { PrefermentType } from '../../engine/types'
import { formatHours, formatPct } from '../../engine/units'
import { totalHours } from '../../engine/phases'
import { AdviceList, SectionTitle } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { NumberField } from '../../components/fields'
import { applyMethod, makePreferment, methodOf, type MethodPreset } from '../../state/recipes'
import { useSettings } from '../../state/store'
import type { StepProps } from './steps'

const METHODS: { id: MethodPreset; emoji: string; title: string; sub: string }[] = [
  { id: 'direct', emoji: '⚡', title: 'Direct', sub: 'Yeast straight into the dough. Simple, predictable.' },
  { id: 'direct-sourdough', emoji: '🫙', title: 'Direct sourdough', sub: 'Ripe starter straight into the dough.' },
  { id: 'biga', emoji: '🧱', title: 'Biga', sub: 'Stiff preferment: aroma, crunch, open crumb.' },
  { id: 'poolish', emoji: '🫧', title: 'Poolish', sub: 'Liquid preferment: extensible, nutty, sweet.' },
  { id: 'biga-poolish', emoji: '🧱🫧', title: 'Biga + poolish', sub: 'The best of both, in one dough.' },
  { id: 'levain', emoji: '🥛', title: 'Sourdough levain', sub: 'Build a levain from your starter first.' },
  { id: 'custom', emoji: '🧪', title: 'Custom mix', sub: 'Any combination of preferments.' },
]

export function StepMethod({ recipe, update, result, onEdit }: StepProps & { onEdit: (id: string) => void }) {
  const settings = useSettings()
  const current = methodOf(recipe)
  const prefFlour = recipe.preferments.reduce((s, p) => s + p.flourPct, 0)
  const prefWater = recipe.preferments.reduce((s, p) => s + (p.flourPct * p.hydration) / 100, 0)

  const add = (type: PrefermentType) =>
    update((r) => ({
      ...r,
      method: 'indirect',
      preferments: [...r.preferments, makePreferment(type, Math.max(5, Math.min(prefermentPreset(type).flourPct, 100 - prefFlour)), settings)],
    }))

  return (
    <div className="stack">
      <h1>How will it rise?</h1>
      <p className="muted">
        Direct dough, or one or more preferments — biga, poolish, sourdough — each fermented on its own schedule and
        combined in the final dough.
      </p>
      <div className="tiles" role="radiogroup" aria-label="Method">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={current === m.id}
            className={`tile${current === m.id ? ' on' : ''}`}
            onClick={() => update((r) => (methodOf(r) === m.id && m.id !== 'custom' ? r : applyMethod(r, m.id, settings)))}
          >
            <span className="t-emoji">{m.emoji}</span>
            <span className="t-title">{m.title}</span>
            <span className="t-sub">{m.sub}</span>
          </button>
        ))}
      </div>

      {recipe.method === 'indirect' && (
        <>
          <SectionTitle>Your preferments</SectionTitle>
          {recipe.preferments.length === 0 && <p className="muted">Add at least one preferment below.</p>}
          <div className="stack-sm">
            {recipe.preferments.map((p, i) => {
              const preset = prefermentPreset(p.type)
              const st = result?.stages.find((s) => s.id === p.id)
              return (
                <div key={p.id} className="card flat stack-sm">
                  <div className="row">
                    <span style={{ fontSize: '1.4rem' }}>{preset.emoji}</span>
                    <div className="grow">
                      <div style={{ fontWeight: 750 }}>
                        {i + 1}. {p.name || preset.name}
                      </div>
                      <div className="muted small">
                        {formatPct(p.hydration, 0)} hydration · {formatHours(totalHours(p.phases))}
                        {st && st.leavening.kind === 'yeast' && ` · ${formatPct(st.leavening.freshPct)} fresh yeast`}
                      </div>
                    </div>
                    <button className="btn soft sm" onClick={() => onEdit(p.id)}>
                      Set up <Icon name="chevronRight" size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => update((r) => ({ ...r, preferments: r.preferments.filter((x) => x.id !== p.id) }))}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                  <NumberField
                    label="Share of the total flour"
                    value={p.flourPct}
                    onChange={(flourPct) =>
                      update((r) => ({ ...r, preferments: r.preferments.map((x) => (x.id === p.id ? { ...x, flourPct } : x)) }))
                    }
                    unit="%"
                    step={5}
                    min={1}
                    max={100}
                    decimals={1}
                  />
                </div>
              )
            })}
          </div>
          <div className="row wrap">
            {PREFERMENTS.map((p) => (
              <button key={p.type} type="button" className="chip" onClick={() => add(p.type)}>
                <Icon name="plus" size={14} />
                {p.emoji} {p.name}
              </button>
            ))}
          </div>
          <div className="card soft">
            <div className="kv">
              <span>Prefermented flour</span>
              <span>{formatPct(prefFlour, 1)}</span>
              <span>Water in preferments</span>
              <span>
                {formatPct(prefWater, 1)} of {formatPct(recipe.hydration, 1)}
              </span>
            </div>
          </div>
          {result && <AdviceList advice={result.advice.filter((a) => a.severity === 'error')} />}
        </>
      )}
      {recipe.method === 'direct' && recipe.directLeavening === 'sourdough' && (
        <p className="muted small">
          You'll set the starter amount (or let the app compute it) in the fermentation step. Starter flour and water are
          counted in your hydration.
        </p>
      )}
    </div>
  )
}
