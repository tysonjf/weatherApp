import { MIXERS, mixerById } from '../../engine/mixers'
import { styleById } from '../../engine/presets'
import { formatTemp, formatTempDelta, formatWeight, localizeTemps } from '../../engine/units'
import { Switch, TempDeltaField, TempField } from '../../components/fields'
import { AdviceList, SectionTitle } from '../../components/ui'
import { WeatherCard } from '../../components/WeatherCard'
import { stageEmoji } from '../../components/stageMeta'
import { useSettings } from '../../state/store'
import type { StepProps } from './steps'

export function StepKitchen({ recipe, update, result }: StepProps) {
  const settings = useSettings()
  const k = recipe.kitchen
  const setK = (patch: Partial<typeof k>) => update((r) => ({ ...r, kitchen: { ...r.kitchen, ...patch } }))
  const mixer = mixerById(k.mixerId)
  const calibrated = settings.mixerRise[k.mixerId]
  const u = settings.tempUnit
  const st = styleById(recipe.styleId)

  return (
    <div className="stack">
      <h1>Your kitchen’s climate</h1>
      <p className="muted">
        Temperatures drive everything: yeast amounts, timings and the exact water temperature for every mix.
      </p>

      <WeatherCard onUseTemp={(roomC) => setK({ roomC })} />

      <div className="card stack">
        <div className="grid-2">
          <TempField
            label={k.nightC === null ? 'Room' : 'Room by day'}
            valueC={k.roomC}
            onChangeC={(roomC) => setK({ roomC })}
            minC={5}
            maxC={40}
          />
          <TempField label="Fridge" valueC={k.fridgeC} onChangeC={(fridgeC) => setK({ fridgeC })} minC={-2} maxC={12} hint={localizeTemps('Measure it — many run 5–7 °C.', u)} />
        </div>
        <Switch
          label="The room cools down at night"
          hint="Without heating or air-con most kitchens swing 2–5 degrees. The forecast then follows the clock: warmest late afternoon, coolest around dawn."
          checked={k.nightC !== null}
          onChange={(v) => setK({ nightC: v ? Math.round((k.roomC - 3) * 2) / 2 : null })}
        />
        {k.nightC !== null && (
          <TempField
            label="Room at night"
            valueC={k.nightC}
            onChangeC={(nightC) => setK({ nightC })}
            minC={0}
            maxC={40}
            hint="The coolest it gets, around dawn."
          />
        )}
        <Switch
          label="Flour is at room temperature"
          checked={k.flourC === null}
          onChange={(v) => setK({ flourC: v ? null : k.roomC })}
        />
        {k.flourC !== null && (
          <TempField label="Flour" valueC={k.flourC} onChangeC={(flourC) => setK({ flourC })} minC={-20} maxC={40} hint="Chilled flour is a great lever on hot days." />
        )}
        <TempField
          label="Coldest water you can pour"
          valueC={k.tapC}
          onChangeC={(tapC) => setK({ tapC })}
          minC={0}
          maxC={35}
          hint="Tap or fridge water. Colder than this and the app uses ice."
        />
      </div>

      <SectionTitle>Mixing</SectionTitle>
      <div className="tiles">
        {MIXERS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`tile${k.mixerId === m.id ? ' on' : ''}`}
            aria-pressed={k.mixerId === m.id}
            onClick={() => setK({ mixerId: m.id, mixerRiseC: null })}
          >
            <span className="t-emoji">{m.emoji}</span>
            <span className="t-title">{m.name}</span>
            <span className="t-sub">+{formatTempDelta(settings.mixerRise[m.id] ?? m.riseC, u, 1)} kneading heat</span>
          </button>
        ))}
      </div>
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>{mixer.blurb}</p>
        <TempDeltaField
          label="Mechanical heat for this recipe"
          valueC={k.mixerRiseC ?? calibrated ?? mixer.riseC}
          onChangeC={(v) => setK({ mixerRiseC: v })}
          hint={
            k.mixerRiseC !== null
              ? 'Custom for this recipe.'
              : calibrated !== undefined
                ? 'Your calibrated value.'
                : `Typical ${formatTempDelta(mixer.range[0], u, 1)}–${formatTempDelta(mixer.range[1], u, 1)} — calibrate it in Tools.`
          }
        />
        <TempField
          label="Target dough temperature after kneading"
          valueC={k.targetFdtC}
          onChangeC={(targetFdtC) => setK({ targetFdtC })}
          minC={14}
          maxC={32}
          hint={`${st.name}: ${formatTemp(st.targetFdtC, u, 0)} suggested. ${localizeTemps('Most pizza doughs: 22–25 °C.', u)}`}
        />
      </div>

      {result && (
        <>
          <SectionTitle>Water for each mix</SectionTitle>
          <div className="stack-sm">
            {result.stages.map((s) =>
              s.waterPlan && Number.isFinite(s.waterPlan.waterC) ? (
                <div key={s.id} className="card flat row">
                  <span style={{ fontSize: '1.4rem' }}>{stageEmoji(s)}</span>
                  <div className="grow">
                    <div style={{ fontWeight: 750 }}>{s.title}</div>
                    <div className="muted small">
                      Finishes at {formatTemp(s.waterPlan.expectedC, u)}
                      {s.waterPlan.iceG > 0.5 && ` · ${formatWeight(s.waterPlan.iceG, settings.weightUnit)} of it as ice`}
                    </div>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--cold)' }} className="num">
                    {formatTemp(s.waterPlan.waterC, u)}
                  </span>
                </div>
              ) : null,
            )}
          </div>
          <AdviceList advice={result.advice.filter((a) => /water|ice|warm this dough|chill/i.test(a.title))} />
        </>
      )}
    </div>
  )
}
