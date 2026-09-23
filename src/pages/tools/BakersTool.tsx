import { useState } from 'react'
import { TopBar } from '../../components/Layout'
import { NumberField, Segmented } from '../../components/fields'
import { Icon } from '../../components/Icon'
import { formatPct, formatWeight } from '../../engine/units'
import { useSettings } from '../../state/store'

type Kind = 'flour' | 'water' | 'starter' | 'other'

interface Row {
  id: number
  name: string
  grams: number
  kind: Kind
}

const START: Row[] = [
  { id: 1, name: 'Flour', grams: 1000, kind: 'flour' },
  { id: 2, name: 'Water', grams: 650, kind: 'water' },
  { id: 3, name: 'Salt', grams: 28, kind: 'other' },
  { id: 4, name: 'Yeast', grams: 1, kind: 'other' },
]

export function BakersTool() {
  const { weightUnit } = useSettings()
  const [rows, setRows] = useState<Row[]>(START)
  const [starterHydration, setStarterHydration] = useState(100)

  const hs = starterHydration / 100
  const starter = rows.filter((r) => r.kind === 'starter').reduce((s, r) => s + r.grams, 0)
  const flour = rows.filter((r) => r.kind === 'flour').reduce((s, r) => s + r.grams, 0) + starter / (1 + hs)
  const water = rows.filter((r) => r.kind === 'water').reduce((s, r) => s + r.grams, 0) + (starter * hs) / (1 + hs)
  const total = rows.reduce((s, r) => s + r.grams, 0)
  const update = (id: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <>
      <TopBar title="Baker's percentages" back="/tools" />
      <main className="page stack">
        <div className="hero">
          <div className="muted small">Hydration</div>
          <div className="big num">{flour > 0 ? formatPct((water / flour) * 100, 1) : '—'}</div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="k">Total flour</div>
              <div className="v">{formatWeight(flour, weightUnit)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">Total water</div>
              <div className="v">{formatWeight(water, weightUnit)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">Dough</div>
              <div className="v">{formatWeight(total, weightUnit)}</div>
            </div>
          </div>
        </div>
        <div className="stack-sm">
          {rows.map((r) => (
            <div className="card flat stack-sm" key={r.id}>
              <div className="row">
                <input
                  className="textbox grow"
                  value={r.name}
                  aria-label="Ingredient name"
                  onChange={(e) => update(r.id, { name: e.target.value })}
                />
                <span className="badge primary">{flour > 0 ? formatPct((r.grams / flour) * 100) : '—'}</span>
                <button className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <div className="grid-2">
                <NumberField value={r.grams} onChange={(grams) => update(r.id, { grams })} unit="g" min={0} max={100000} decimals={2} step={1} ariaLabel="Grams" />
                <Segmented
                  ariaLabel="Counts as"
                  value={r.kind}
                  onChange={(kind) => update(r.id, { kind })}
                  options={[
                    { value: 'flour', label: 'Flour' },
                    { value: 'water', label: 'Water' },
                    { value: 'starter', label: 'Starter' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
        <button className="btn soft" onClick={() => setRows([...rows, { id: Date.now(), name: 'Ingredient', grams: 0, kind: 'other' }])}>
          <Icon name="plus" size={18} /> Add ingredient
        </button>
        {starter > 0 && (
          <NumberField
            label="Starter hydration"
            value={starterHydration}
            onChange={setStarterHydration}
            unit="%"
            min={30}
            max={200}
            hint="The starter's flour and water are counted in the totals."
          />
        )}
      </main>
    </>
  )
}
