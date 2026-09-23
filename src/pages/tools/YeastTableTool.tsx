import { useState } from 'react'
import { TopBar } from '../../components/Layout'
import { NumberField, Segmented } from '../../components/fields'
import type { YeastType } from '../../engine/types'
import { doughMultiplier, rateAt, yeastForEqHours } from '../../engine/fermentation'
import { formatTemp } from '../../engine/units'
import { YEAST_LABEL, yeastFromFresh } from '../../engine/yeastTypes'
import { useSettings } from '../../state/store'

const HOURS = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 36, 48, 72]
const TEMPS = [4, 8, 12, 16, 18, 20, 22, 24, 26, 28, 30]

function fmt(v: number): string {
  if (!Number.isFinite(v) || v > 5) return '—'
  if (v < 0.001) return '<.001'
  if (v < 0.01) return v.toFixed(3).replace(/^0/, '')
  if (v < 0.1) return v.toFixed(3).replace(/^0/, '')
  if (v < 1) return v.toFixed(2).replace(/^0/, '')
  return v.toFixed(2)
}

export function YeastTableTool() {
  const settings = useSettings()
  const [yType, setYType] = useState<YeastType>(settings.yeastType)
  const [hydration, setHydration] = useState(63)
  const [salt, setSalt] = useState(2.8)
  const m = doughMultiplier({ hydration, saltPct: salt, oilPct: 0, sugarPct: 0 }) * settings.yeastScale
  const logMin = Math.log(0.002)
  const logMax = Math.log(5)
  const shade = (v: number) => {
    if (!Number.isFinite(v) || v > 5) return 0
    return Math.max(0.06, Math.min(0.9, (Math.log(Math.max(0.002, v)) - logMin) / (logMax - logMin)))
  }

  return (
    <>
      <TopBar title="Yeast forecast table" back="/tools" />
      <main className="page stack">
        <p className="muted">
          {YEAST_LABEL[yType]} (% of flour) for a dough to be ready after a constant temperature and time. From Craig’s
          fermentation chart with your hydration and salt. Darker = more yeast.
        </p>
        <div className="card stack">
          <Segmented
            ariaLabel="Yeast type"
            value={yType}
            onChange={setYType}
            options={[
              { value: 'instant', label: 'Instant' },
              { value: 'active-dry', label: 'Active dry' },
              { value: 'fresh', label: 'Fresh' },
            ]}
          />
          <div className="grid-2">
            <NumberField label="Hydration" value={hydration} onChange={setHydration} unit="%" min={45} max={100} />
            <NumberField label="Salt" value={salt} onChange={setSalt} unit="%" step={0.1} min={0} max={4} decimals={2} />
          </div>
        </div>
        <div className="table-wrap">
          <table className="data heat">
            <thead>
              <tr>
                <th>Hours</th>
                {TEMPS.map((t) => (
                  <th key={t}>{formatTemp(t, settings.tempUnit, 0)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h) => (
                <tr key={h}>
                  <td style={{ fontWeight: 750 }}>{h} h</td>
                  {TEMPS.map((t) => {
                    const v = yeastFromFresh(yeastForEqHours('dough', h * rateAt(t), m), yType)
                    const s = shade(v)
                    return (
                      <td
                        key={t}
                        title={`${h} h at ${formatTemp(t, settings.tempUnit, 0)}: ${fmt(v)} %`}
                        style={{
                          background: s ? `color-mix(in srgb, var(--viz-dough) ${Math.round(s * 100)}%, var(--surface))` : undefined,
                          color: s > 0.55 ? '#fff' : 'var(--text)',
                        }}
                      >
                        {fmt(v)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend" aria-hidden="true">
          <span>
            <span className="sw" style={{ background: 'color-mix(in srgb, var(--viz-dough) 8%, var(--surface))', border: '1px solid var(--border)' }} />
            under 0.01 %
          </span>
          <span>
            <span className="sw" style={{ background: 'color-mix(in srgb, var(--viz-dough) 45%, var(--surface))' }} />
            ~0.1 %
          </span>
          <span>
            <span className="sw" style={{ background: 'color-mix(in srgb, var(--viz-dough) 85%, var(--surface))' }} />
            1 %+
          </span>
          <span>— = impractical (over 5 %)</span>
        </div>
        <p className="muted small">
          Constant temperature. Real plans with fridge phases are better handled by the Yeast ⇄ time tool or a full
          recipe, which simulate how long the dough takes to chill.
        </p>
      </main>
    </>
  )
}
