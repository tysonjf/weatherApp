import { useMemo, useState } from 'react'
import { TopBar } from '../../components/Layout'
import { NumberField, Segmented, TempField } from '../../components/fields'
import { PhaseBar, PhaseEditor } from '../../components/PhaseEditor'
import { Alert, SectionTitle } from '../../components/ui'
import type { Phase, YeastType } from '../../engine/types'
import { makePhase, phaseTempC } from '../../engine/phases'
import {
  bigaHoursFor,
  bigaRateAt,
  bigaYeastFor,
  doughMultiplier,
  eqHoursForYeast,
  rateAt,
  saltMultiplier,
  simulate,
  yeastForEqHours,
} from '../../engine/fermentation'
import { formatHours, formatNumber, formatPct, formatTemp } from '../../engine/units'
import { YEAST_LABEL, yeastFromFresh, yeastToFresh } from '../../engine/yeastTypes'
import { useSettings } from '../../state/store'
import { pressureRatio } from '../../engine/altitude'

type Kind = 'dough' | 'biga' | 'poolish'

export function YeastTimeTool() {
  const settings = useSettings()
  const [mode, setMode] = useState<'yeast' | 'time'>('yeast')
  const [kind, setKind] = useState<Kind>('dough')
  const [hydration, setHydration] = useState(63)
  const [salt, setSalt] = useState(2.8)
  const [roomC, setRoomC] = useState(settings.roomC)
  const [fridgeC, setFridgeC] = useState(settings.fridgeC)
  const [startC, setStartC] = useState(24)
  const [piece, setPiece] = useState(250)
  const [phases, setPhases] = useState<Phase[]>([makePhase('room', 2, 'bulk'), makePhase('fridge', 22, 'balls'), makePhase('room', 3, 'balls')])
  const [yType, setYType] = useState<YeastType>(settings.yeastType)
  const [yeastPct, setYeastPct] = useState(0.1)
  const [constC, setConstC] = useState(21)
  const kitchen = { roomC, fridgeC }
  const u = settings.tempUnit
  const scale = settings.yeastScale * pressureRatio(settings.altitudeM)

  const effHydration = kind === 'poolish' ? 100 : kind === 'biga' ? Math.min(60, hydration) : hydration
  const sim = useMemo(
    () => simulate(phases.map((p) => ({ envC: phaseTempC(p, { roomC, fridgeC }), hours: p.hours, pieceMassG: piece })), startC),
    [phases, roomC, fridgeC, piece, startC],
  )
  const fresh =
    kind === 'biga'
      ? bigaYeastFor(sim.bigaEq18, effHydration, 0) * scale
      : kind === 'poolish'
        ? yeastForEqHours('poolish', sim.eqHours, scale)
        : yeastForEqHours('dough', sim.eqHours, doughMultiplier({ hydration, saltPct: salt, oilPct: 0, sugarPct: 0 }) * scale)
  const instantHours = phases.reduce((s, p) => s + p.hours * rateAt(phaseTempC(p, kitchen)), 0)

  // The calibration says how much more yeast your kitchen needs, so the same yeast acts like less.
  const freshIn = yeastToFresh(yeastPct, yType) / scale
  const hoursAt = (t: number) =>
    kind === 'biga'
      ? bigaHoursFor(freshIn, effHydration) / bigaRateAt(t)
      : kind === 'poolish'
        ? eqHoursForYeast('poolish', freshIn, saltMultiplier(0, 100)) / rateAt(t)
        : eqHoursForYeast('dough', freshIn, doughMultiplier({ hydration, saltPct: salt, oilPct: 0, sugarPct: 0 })) / rateAt(t)

  return (
    <>
      <TopBar title="Yeast ⇄ time" back="/tools" />
      <main className="page stack">
        <Segmented
          ariaLabel="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'yeast', label: 'How much yeast?' },
            { value: 'time', label: 'How long will it take?' },
          ]}
        />
        <div className="card stack">
          <Segmented
            ariaLabel="What"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'dough', label: 'Dough' },
              { value: 'biga', label: 'Biga' },
              { value: 'poolish', label: 'Poolish' },
            ]}
          />
          {kind !== 'poolish' && (
            <div className="grid-2">
              <NumberField label="Hydration" value={hydration} onChange={setHydration} unit="%" min={40} max={100} />
              {kind === 'dough' && <NumberField label="Salt" value={salt} onChange={setSalt} unit="%" step={0.1} min={0} max={4} decimals={2} />}
            </div>
          )}
        </div>

        {mode === 'yeast' ? (
          <>
            <div className="card stack">
              <div className="grid-2">
                <TempField label="Room" valueC={roomC} onChangeC={setRoomC} minC={5} maxC={38} />
                <TempField label="Fridge" valueC={fridgeC} onChangeC={setFridgeC} minC={-2} maxC={12} />
                <TempField label="Dough after mixing" valueC={startC} onChangeC={setStartC} minC={5} maxC={35} />
                <NumberField label="Piece size" value={piece} onChange={setPiece} unit="g" step={50} min={50} max={10000} decimals={0} hint="Ball or bulk mass (affects chilling)." />
              </div>
              <PhaseBar phases={phases} kitchen={kitchen} />
              <PhaseEditor phases={phases} onChange={setPhases} kitchen={kitchen} />
            </div>
            <div className="hero warm">
              <div className="muted small">You need</div>
              <div className="big">{formatPct(yeastFromFresh(fresh, yType))}</div>
              <div className="muted">{YEAST_LABEL[yType]} on flour</div>
              <div className="hero-stats">
                {(['fresh', 'active-dry', 'instant'] as YeastType[]).map((t) => (
                  <div key={t} className="hero-stat">
                    <div className="k">{t === 'active-dry' ? 'ADY' : t === 'instant' ? 'IDY' : 'Fresh'}</div>
                    <div className="v">{formatNumber(yeastFromFresh(fresh, t) * 10, 2)} g/kg</div>
                  </div>
                ))}
              </div>
            </div>
            <Segmented
              ariaLabel="Show as"
              value={yType}
              onChange={setYType}
              options={[
                { value: 'instant', label: 'Instant' },
                { value: 'active-dry', label: 'Active dry' },
                { value: 'fresh', label: 'Fresh' },
              ]}
            />
            <Alert severity="info" title={`${formatHours(sim.eqHours)} of fermentation at ${formatTemp(21, u, 0)} equivalent`}>
              Without modelling how slowly dough chills, the same plan would count as {formatHours(instantHours)} — the gap is
              the extra fermentation while the dough cools in the fridge. The dough ends at {formatTemp(sim.endC, u)}.
            </Alert>
          </>
        ) : (
          <>
            <div className="card stack">
              <div className="grid-2">
                <NumberField label="Yeast" value={yeastPct} onChange={setYeastPct} unit="%" step={0.05} min={0.001} max={5} decimals={3} />
                <TempField label="Temperature" valueC={constC} onChangeC={setConstC} minC={1} maxC={35} />
              </div>
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
            </div>
            <div className="hero">
              <div className="muted small">Ready in about</div>
              <div className="big">{formatHours(hoursAt(constC))}</div>
              <div className="muted">at a steady {formatTemp(constC, u, 0)}</div>
            </div>
            <SectionTitle>At other temperatures</SectionTitle>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Temperature</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {[4, 8, 12, 16, 18, 20, 22, 24, 26, 28, 30].map((t) => (
                    <tr key={t}>
                      <td>{formatTemp(t, u, 0)}</td>
                      <td>{formatHours(hoursAt(t))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  )
}
