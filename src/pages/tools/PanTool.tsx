import { useState } from 'react'
import { TopBar } from '../../components/Layout'
import { LengthField, NumberField, Segmented, WeightField } from '../../components/fields'
import { SectionTitle } from '../../components/ui'
import { G_PER_CM2_PER_OZ_PER_IN2, formatNumber, formatWeight, roundTo } from '../../engine/units'
import { useSettings } from '../../state/store'

const TF_PRESETS: { label: string; tf: number }[] = [
  { label: 'Roman tonda', tf: 0.24 },
  { label: 'Neapolitan', tf: 0.34 },
  { label: 'Canotto', tf: 0.38 },
  { label: 'New York', tf: 0.4 },
  { label: 'Grandma', tf: 0.46 },
  { label: 'Teglia', tf: 0.55 },
  { label: 'Detroit', tf: 0.57 },
  { label: 'Sicilian', tf: 0.6 },
  { label: 'Focaccia', tf: 0.64 },
  { label: 'Cast-iron pan', tf: 0.69 },
]

export function PanTool() {
  const { weightUnit } = useSettings()
  const imperial = weightUnit === 'oz'
  const [mode, setMode] = useState<'round' | 'rect' | 'reverse'>('round')
  const [d, setD] = useState(30)
  const [w, setW] = useState(30)
  const [l, setL] = useState(40)
  const [tf, setTf] = useState(0.34)
  const [grams, setGrams] = useState(250)

  const area = mode === 'rect' ? w * l : (Math.PI * d * d) / 4
  const weight = area * tf
  const diameter = Math.sqrt((4 * grams) / (Math.PI * tf))

  return (
    <>
      <TopBar title="Pan & ball size" back="/tools" />
      <main className="page stack">
        <Segmented
          ariaLabel="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'round', label: 'Round pizza' },
            { value: 'rect', label: 'Rectangular pan' },
            { value: 'reverse', label: 'Ball → size' },
          ]}
        />
        <div className="card stack">
          {mode === 'round' && <LengthField label="Diameter" cm={d} onChange={setD} />}
          {mode === 'rect' && (
            <div className="grid-2">
              <LengthField label="Width" cm={w} onChange={setW} />
              <LengthField label="Length" cm={l} onChange={setL} />
            </div>
          )}
          {mode === 'reverse' && <WeightField label="Ball weight" grams={grams} onChange={setGrams} min={50} max={3000} />}
          {imperial ? (
            <NumberField
              label="Thickness factor"
              value={roundTo(tf / G_PER_CM2_PER_OZ_PER_IN2, 0.001)}
              onChange={(v) => setTf(v * G_PER_CM2_PER_OZ_PER_IN2)}
              unit="oz/in²"
              step={0.005}
              min={0.03}
              max={0.3}
              decimals={3}
            />
          ) : (
            <NumberField label="Thickness factor" value={tf} onChange={setTf} unit="g/cm²" step={0.01} min={0.15} max={1.3} decimals={3} />
          )}
          <div className="row wrap">
            {TF_PRESETS.map((p) => (
              <button key={p.label} type="button" className={`chip${Math.abs(tf - p.tf) < 0.001 ? ' on' : ''}`} onClick={() => setTf(p.tf)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="hero warm">
          {mode === 'reverse' ? (
            <>
              <div className="muted small">Stretches to about</div>
              <div className="big">{imperial ? `${formatNumber(diameter / 2.54, 1)}″` : `${formatNumber(diameter, 0)} cm`}</div>
            </>
          ) : (
            <>
              <div className="muted small">Dough per {mode === 'rect' ? 'pan' : 'pizza'}</div>
              <div className="big">{formatWeight(weight, weightUnit)}</div>
              <div className="muted small">{formatNumber(area, 0)} cm² ({formatNumber(area / 6.4516, 0)} in²)</div>
            </>
          )}
        </div>
        <SectionTitle>How it works</SectionTitle>
        <p className="muted small">
          Thickness factor = dough weight ÷ area. Published factors for hand-stretched pizzas already include the rim.
          Add 10–15 % for rolled-and-trimmed crusts, and for sloped pans use the average of the top and bottom diameter.
        </p>
      </main>
    </>
  )
}
