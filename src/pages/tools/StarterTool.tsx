import { useState } from 'react'
import { TopBar } from '../../components/Layout'
import { NumberField, TempField, WeightField } from '../../components/fields'
import { SectionTitle } from '../../components/ui'
import { doublingsForSeed, sdDoublingHours, seedForDoublings } from '../../engine/fermentation'
import { formatHours, formatNumber, formatTemp, formatWeight } from '../../engine/units'
import { useSettings } from '../../state/store'

export function StarterTool() {
  const settings = useSettings()
  const [needG, setNeedG] = useState(150)
  const [hydration, setHydration] = useState(100)
  const [tempC, setTempC] = useState(settings.roomC)
  const [hours, setHours] = useState(8)
  const D = sdDoublingHours(tempC)
  const scale = settings.yeastScale
  const seed = Math.min(2, Math.max(0.02, seedForDoublings(hours / D) * scale))
  // Build so the final weight covers the need plus ~10 % to keep as the mother.
  const total = needG * 1.1
  const h = hydration / 100
  const flour = total / (1 + h) / (1 + seed / (1 + h))
  const seedG = flour * seed
  const water = total - seedG - flour
  const wu = settings.weightUnit
  const ratio = 1 / seed

  return (
    <>
      <TopBar title="Starter feeding planner" back="/tools" />
      <main className="page stack">
        <p className="muted">Pick when you need your starter at its peak — the planner picks the feeding ratio.</p>
        <div className="card stack">
          <div className="grid-2">
            <WeightField label="Starter needed" grams={needG} onChange={setNeedG} min={10} max={5000} />
            <NumberField label="Starter hydration" value={hydration} onChange={setHydration} unit="%" step={5} min={40} max={150} />
            <TempField label="Where it will sit" valueC={tempC} onChangeC={setTempC} minC={4} maxC={35} />
            <NumberField label="Peak in" value={hours} onChange={setHours} unit="h" step={1} min={2} max={36} decimals={1} />
          </div>
        </div>
        <div className="hero warm">
          <div className="muted small">Feed at</div>
          <div className="big">
            1 : {formatNumber(ratio, 1)} : {formatNumber(ratio * h, 1)}
          </div>
          <div className="muted small">starter : flour : water</div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="k">Starter</div>
              <div className="v">{formatWeight(seedG, wu)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">Flour</div>
              <div className="v">{formatWeight(flour, wu)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">Water</div>
              <div className="v">{formatWeight(water, wu)}</div>
            </div>
          </div>
        </div>
        {(seed >= 1.99 || seed <= 0.021) && (
          <p className="muted small">That's at the edge of what a single feed can do — consider a warmer/cooler spot or two feeds.</p>
        )}
        <SectionTitle>Peak times at {formatTemp(tempC, settings.tempUnit, 0)}</SectionTitle>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Feed</th>
                <th>Peaks after</th>
              </tr>
            </thead>
            <tbody>
              {[1, 0.5, 0.2, 0.1, 0.05].map((s) => (
                <tr key={s}>
                  <td>
                    1 : {formatNumber(1 / s, 0)} : {formatNumber((1 / s) * h, 1)}
                  </td>
                  <td>{formatHours(doublingsForSeed(s / scale) * D)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Based on Craig’s sourdough fermentation data (doubling time {formatHours(D)} at this temperature for a salted
          dough; unsalted starter builds run ~1.6× faster). Every starter differs — note when yours actually peaks and
          adjust the hours.
        </p>
      </main>
    </>
  )
}
