import { useState } from 'react'
import { TopBar } from '../../components/Layout'
import { NumberField, SelectField, TempDeltaField, TempField } from '../../components/fields'
import { Alert } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { MIXERS, mixerById } from '../../engine/mixers'
import { C_FLOUR, C_SALT, classicWaterTemp, mixCp, solveWater, type ThermalMass } from '../../engine/temperature'
import { formatTemp, formatTempDelta, formatWeight } from '../../engine/units'
import { useSettings } from '../../state/store'

interface PrefRow {
  id: number
  flour: number
  hydration: number
  tempC: number
}

export function WaterTool() {
  const settings = useSettings()
  const [flour, setFlour] = useState(1000)
  const [hydration, setHydration] = useState(65)
  const [salt, setSalt] = useState(2.8)
  const [roomC, setRoomC] = useState(settings.roomC)
  const [flourC, setFlourC] = useState(settings.roomC)
  const [tapC, setTapC] = useState(settings.tapC)
  const [targetC, setTargetC] = useState(24)
  const [mixerId, setMixerId] = useState(settings.mixerId)
  const mixer = mixerById(mixerId)
  const [riseC, setRiseC] = useState(settings.mixerRise[mixerId] ?? mixer.riseC)
  const [prefs, setPrefs] = useState<PrefRow[]>([])

  const prefFlour = prefs.reduce((s, p) => s + p.flour, 0)
  const prefWater = prefs.reduce((s, p) => s + (p.flour * p.hydration) / 100, 0)
  const freshFlour = Math.max(0, flour - prefFlour)
  const water = Math.max(0, (flour * hydration) / 100 - prefWater)

  const masses: ThermalMass[] = [
    { label: 'flour', massG: freshFlour, cp: C_FLOUR, tempC: flourC },
    { label: 'salt', massG: (flour * salt) / 100, cp: C_SALT, tempC: roomC },
    ...prefs.map((p) => ({
      label: 'preferment',
      massG: p.flour * (1 + p.hydration / 100),
      cp: mixCp(p.flour, (p.flour * p.hydration) / 100),
      tempC: p.tempC,
    })),
  ]
  const r = solveWater({ masses, waterG: water, newFlourG: freshFlour, targetC, mixerRiseC: riseC, tapC, maxWaterC: settings.maxWaterC })
  const classic = classicWaterTemp({
    targetC,
    flourC,
    roomC,
    frictionFactorC: mixer.classicFF,
    prefermentTempsC: prefs.map((p) => p.tempC),
  })
  const u = settings.tempUnit

  return (
    <>
      <TopBar title="Water temperature" back="/tools" />
      <main className="page stack">
        <div className="hero">
          <div className="muted small">Pour your water at</div>
          <div className="big num">{Number.isFinite(r.waterC) ? formatTemp(r.waterC, u) : '—'}</div>
          {r.status === 'ice' && (
            <div style={{ marginTop: 6 }}>
              <b>{formatWeight(r.liquidG, settings.weightUnit)}</b> water + <b>{formatWeight(r.iceG, settings.weightUnit)}</b>{' '}
              crushed ice
            </div>
          )}
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="k">Water</div>
              <div className="v">{formatWeight(water, settings.weightUnit)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">Dough will be</div>
              <div className="v">{formatTemp(r.expectedC, u)}</div>
            </div>
            <div className="hero-stat">
              <div className="k">Classic rule</div>
              <div className="v">{formatTemp(classic, u)}</div>
            </div>
          </div>
        </div>

        {r.status === 'too-hot' && (
          <Alert severity="warn" title="Water alone can't warm this dough enough">
            It would need {formatTemp(r.idealWaterC, u)} water; capped at {formatTemp(r.waterC, u)}, your warmest (Settings).
            Let a cold preferment rest out of the fridge for an hour or two, warm the flour, or mix a little longer — or accept{' '}
            {formatTemp(r.expectedC, u)} and allow more time.
          </Alert>
        )}
        {r.status === 'too-cold' && (
          <Alert severity="warn" title="Even with ice this dough ends up warm">
            Ice is capped at 35 % of the water. You'll reach about {formatTemp(r.expectedC, u)}.
            {r.flourNeededC !== undefined && ` Chill the flour to ${formatTemp(r.flourNeededC, u)} to hit the target.`}
          </Alert>
        )}

        <div className="card stack">
          <h3>Dough</h3>
          <div className="grid-2">
            <NumberField label="Total flour" value={flour} onChange={setFlour} unit="g" step={50} min={50} max={50000} decimals={0} />
            <NumberField label="Hydration" value={hydration} onChange={setHydration} unit="%" step={1} min={40} max={120} />
          </div>
          <NumberField label="Salt" value={salt} onChange={setSalt} unit="%" step={0.1} min={0} max={5} decimals={2} />
        </div>

        <div className="card stack">
          <h3>Temperatures</h3>
          <div className="grid-2">
            <TempField label="Target dough" valueC={targetC} onChangeC={setTargetC} minC={10} maxC={32} />
            <TempField label="Flour" valueC={flourC} onChangeC={setFlourC} minC={-20} maxC={40} />
            <TempField label="Room" valueC={roomC} onChangeC={setRoomC} minC={5} maxC={40} />
            <TempField label="Coldest water" valueC={tapC} onChangeC={setTapC} minC={0} maxC={35} />
          </div>
          <SelectField
            label="Mixer"
            value={mixerId}
            onChange={(id) => {
              setMixerId(id)
              setRiseC(settings.mixerRise[id] ?? mixerById(id).riseC)
            }}
            options={MIXERS.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }))}
          />
          <TempDeltaField label="Mixer heat (mechanical)" valueC={riseC} onChangeC={setRiseC} />
        </div>

        <div className="card stack">
          <div className="row between">
            <h3 style={{ margin: 0 }}>Preferments</h3>
            <button
              className="btn soft sm"
              onClick={() => setPrefs([...prefs, { id: Date.now(), flour: 300, hydration: 100, tempC: settings.fridgeC }])}
            >
              <Icon name="plus" size={16} /> Add
            </button>
          </div>
          {prefs.length === 0 && <p className="muted small">Add a biga, poolish or starter to include its temperature.</p>}
          {prefs.map((p, i) => (
            <div className="phase" key={p.id}>
              <div className="phase-head">
                Preferment {i + 1}
                <button className="icon-btn" aria-label="Remove" onClick={() => setPrefs(prefs.filter((x) => x.id !== p.id))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <div className="grid-3">
                <NumberField
                  label="Flour"
                  value={p.flour}
                  onChange={(v) => setPrefs(prefs.map((x) => (x.id === p.id ? { ...x, flour: v } : x)))}
                  unit="g"
                  step={50}
                  min={0}
                  max={flour}
                  decimals={0}
                  steppers={false}
                />
                <NumberField
                  label="Hydration"
                  value={p.hydration}
                  onChange={(v) => setPrefs(prefs.map((x) => (x.id === p.id ? { ...x, hydration: v } : x)))}
                  unit="%"
                  min={30}
                  max={150}
                  steppers={false}
                />
                <TempField
                  label="Temp"
                  valueC={p.tempC}
                  onChangeC={(v) => setPrefs(prefs.map((x) => (x.id === p.id ? { ...x, tempC: v } : x)))}
                  minC={-2}
                  maxC={35}
                  steppers={false}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="muted small">
          Heat balance with flour at 1.80 kJ/kg·K, water 4.186, flour hydration heat 15.1 kJ/kg and your mixer's
          mechanical heat. The classic rule shown is n × target − (flour + room + friction factor
          {prefs.length ? ' + preferments' : ''}) with a friction factor of {formatTempDelta(mixer.classicFF, u, 0)}.
        </p>
      </main>
    </>
  )
}
