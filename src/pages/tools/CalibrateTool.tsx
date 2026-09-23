import { useState } from 'react'
import { TopBar } from '../../components/Layout'
import { NumberField, SelectField, TempField } from '../../components/fields'
import { Alert } from '../../components/ui'
import { MIXERS, mixerById } from '../../engine/mixers'
import { C_FLOUR, C_SALT, calibrateMixerRise, mixCp, type ThermalMass } from '../../engine/temperature'
import { formatTempDelta } from '../../engine/units'
import { useSettings, useStore } from '../../state/store'

export function CalibrateTool() {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  const [mixerId, setMixerId] = useState(settings.mixerId)
  const [flour, setFlour] = useState(1000)
  const [flourC, setFlourC] = useState(settings.roomC)
  const [water, setWater] = useState(620)
  const [waterC, setWaterC] = useState(15)
  const [ice, setIce] = useState(0)
  const [salt, setSalt] = useState(28)
  const [prefG, setPrefG] = useState(0)
  const [prefHyd, setPrefHyd] = useState(45)
  const [prefC, setPrefC] = useState(18)
  const [measured, setMeasured] = useState(24)
  const [saved, setSaved] = useState(false)
  const mixer = mixerById(mixerId)
  const u = settings.tempUnit

  const prefFlour = prefG / (1 + prefHyd / 100)
  const masses: ThermalMass[] = [
    { label: 'flour', massG: flour, cp: C_FLOUR, tempC: flourC },
    { label: 'salt', massG: salt, cp: C_SALT, tempC: flourC },
  ]
  if (prefG > 0) masses.push({ label: 'preferment', massG: prefG, cp: mixCp(prefFlour, prefG - prefFlour), tempC: prefC })
  const rise = calibrateMixerRise({ masses, waterG: water + ice, newFlourG: flour, waterC, iceG: ice, measuredC: measured })
  const outOfRange = rise < mixer.range[0] - 2 || rise > mixer.range[1] + 3

  return (
    <>
      <TopBar title="Mixer calibration" back="/tools" />
      <main className="page stack">
        <p className="muted">
          Mix one batch as you normally would, probe the dough right away, and enter what went in. The app back-solves
          how much heat your mixer adds — then every water temperature gets more accurate.
        </p>
        <div className="card stack">
          <SelectField
            label="Mixer"
            value={mixerId}
            onChange={(id) => {
              setMixerId(id)
              setSaved(false)
            }}
            options={MIXERS.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }))}
          />
          <div className="grid-2">
            <NumberField label="Flour (new, dry)" value={flour} onChange={setFlour} unit="g" step={50} min={0} max={50000} decimals={0} />
            <TempField label="Flour temperature" valueC={flourC} onChangeC={setFlourC} minC={-20} maxC={40} />
            <NumberField label="Water" value={water} onChange={setWater} unit="g" step={10} min={0} max={50000} decimals={0} />
            <TempField label="Water temperature" valueC={waterC} onChangeC={setWaterC} minC={0} maxC={45} />
            <NumberField label="Ice" value={ice} onChange={setIce} unit="g" step={10} min={0} max={5000} decimals={0} />
            <NumberField label="Salt" value={salt} onChange={setSalt} unit="g" step={1} min={0} max={2000} decimals={0} />
          </div>
        </div>
        <div className="card stack">
          <h3>Preferment (optional)</h3>
          <div className="grid-3">
            <NumberField label="Weight" value={prefG} onChange={setPrefG} unit="g" step={50} min={0} max={50000} decimals={0} steppers={false} />
            <NumberField label="Hydration" value={prefHyd} onChange={setPrefHyd} unit="%" min={30} max={150} steppers={false} />
            <TempField label="Temp" valueC={prefC} onChangeC={setPrefC} minC={-2} maxC={35} steppers={false} />
          </div>
        </div>
        <div className="card">
          <TempField label="Measured dough temperature after kneading" valueC={measured} onChangeC={setMeasured} minC={5} maxC={40} />
        </div>
        <div className="hero">
          <div className="muted small">{mixer.name} adds about</div>
          <div className="big">{formatTempDelta(rise, u, 1)}</div>
          <div className="muted small">
            of kneading heat (flour hydration heat already accounted for). Typical {formatTempDelta(mixer.range[0], u, 1)}–
            {formatTempDelta(mixer.range[1], u, 1)}.
          </div>
          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            onClick={() => {
              setSettings({ mixerRise: { ...settings.mixerRise, [mixerId]: Math.round(rise * 10) / 10 }, mixerId })
              setSaved(true)
            }}
          >
            Save as my {mixer.name.toLowerCase()}
          </button>
        </div>
        {saved && <Alert severity="tip" title="Saved">New recipes and water temperatures will use it.</Alert>}
        {outOfRange && (
          <Alert severity="warn" title="That's unusual for this mixer">
            Double-check the temperatures (probe several spots and average) and that the weights are right. Very long
            mixes or small batches can legitimately fall outside the typical range.
          </Alert>
        )}
      </main>
    </>
  )
}
