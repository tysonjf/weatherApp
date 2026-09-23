import { TopBar } from '../components/Layout'
import { ClockField, NumberField, Segmented, SelectField, Switch, TempDeltaField, TempField } from '../components/fields'
import { SectionTitle } from '../components/ui'
import { MIXERS, mixerById } from '../engine/mixers'
import type { YeastType } from '../engine/types'
import { formatTempDelta } from '../engine/units'
import { YEAST_LABEL } from '../engine/yeastTypes'
import { useSettings, useStore } from '../state/store'

export function SettingsPage() {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  const mixer = mixerById(settings.mixerId)
  const calibrated = settings.mixerRise[mixer.id]

  return (
    <>
      <TopBar title="Settings" />
      <main className="page">
        <SectionTitle>Units & display</SectionTitle>
        <div className="card stack">
          <div className="field">
            <span className="label">Temperature</span>
            <Segmented
              value={settings.tempUnit}
              onChange={(tempUnit) => setSettings({ tempUnit })}
              options={[
                { value: 'C', label: '°C' },
                { value: 'F', label: '°F' },
              ]}
            />
          </div>
          <div className="field">
            <span className="label">Weights</span>
            <Segmented
              value={settings.weightUnit}
              onChange={(weightUnit) => setSettings({ weightUnit })}
              options={[
                { value: 'g', label: 'Grams' },
                { value: 'oz', label: 'Ounces' },
              ]}
            />
          </div>
          <div className="field">
            <span className="label">Clock</span>
            <Segmented
              value={settings.timeFormat}
              onChange={(timeFormat) => setSettings({ timeFormat })}
              options={[
                { value: '24h', label: '24-hour' },
                { value: '12h', label: '12-hour' },
              ]}
            />
          </div>
          <div className="field">
            <span className="label">Theme</span>
            <Segmented
              value={settings.theme}
              onChange={(theme) => setSettings({ theme })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Light', icon: 'sun' },
                { value: 'dark', label: 'Dark', icon: 'moon' },
              ]}
            />
          </div>
        </div>

        <SectionTitle>Defaults for new doughs</SectionTitle>
        <div className="card stack">
          <SelectField<YeastType>
            label="Yeast I use"
            value={settings.yeastType}
            onChange={(yeastType) => setSettings({ yeastType })}
            options={(['instant', 'active-dry', 'fresh'] as YeastType[]).map((t) => ({ value: t, label: YEAST_LABEL[t] }))}
          />
          <div className="grid-2">
            <TempField label={settings.nightC === null ? 'Room' : 'Room by day'} valueC={settings.roomC} onChangeC={(roomC) => setSettings({ roomC })} minC={5} maxC={40} />
            <TempField label="Fridge" valueC={settings.fridgeC} onChangeC={(fridgeC) => setSettings({ fridgeC })} minC={-2} maxC={12} />
          </div>
          <Switch
            label="My kitchen cools down at night"
            checked={settings.nightC !== null}
            onChange={(v) => setSettings({ nightC: v ? Math.round((settings.roomC - 3) * 2) / 2 : null })}
          />
          {settings.nightC !== null && (
            <TempField label="Room at night" valueC={settings.nightC} onChangeC={(nightC) => setSettings({ nightC })} minC={0} maxC={40} />
          )}
          <TempField
            label="Coldest tap / fridge water"
            valueC={settings.tapC}
            onChangeC={(tapC) => setSettings({ tapC })}
            minC={0}
            maxC={35}
            hint="Below this the app switches to ice."
          />
          <SelectField
            label="Mixer"
            value={settings.mixerId}
            onChange={(mixerId) => setSettings({ mixerId })}
            options={MIXERS.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }))}
            hint={mixer.blurb}
          />
          <TempDeltaField
            label={`${mixer.name}: mechanical heat`}
            valueC={calibrated ?? mixer.riseC}
            onChangeC={(v) => setSettings({ mixerRise: { ...settings.mixerRise, [mixer.id]: v } })}
            minC={-3}
            maxC={15}
            hint={
              calibrated === undefined
                ? `Typical ${formatTempDelta(mixer.range[0], settings.tempUnit, 1)}–${formatTempDelta(mixer.range[1], settings.tempUnit, 1)}. Use the Mixer calibration tool to measure yours.`
                : 'Calibrated value.'
            }
          />
          {calibrated !== undefined && (
            <button
              className="btn soft sm"
              onClick={() => {
                const next = { ...settings.mixerRise }
                delete next[mixer.id]
                setSettings({ mixerRise: next })
              }}
            >
              Reset to typical value
            </button>
          )}
          <NumberField
            label="Yeast calibration"
            value={Math.round(settings.yeastScale * 100)}
            onChange={(v) => setSettings({ yeastScale: v / 100 })}
            unit="%"
            step={5}
            min={50}
            max={200}
            decimals={0}
            hint="100 % = the model as is. If your doughs are consistently slow, raise it (e.g. 120 %); if they over-proof, lower it. Applies to every yeast and starter amount."
          />
          <Switch
            label="Show classic DDT formula"
            hint="Also show the bakers' 3×/4× friction-factor answer next to the heat-balance water temperature."
            checked={settings.showClassicDdt}
            onChange={(showClassicDdt) => setSettings({ showClassicDdt })}
          />
        </div>

        <SectionTitle>My day</SectionTitle>
        <div className="card stack">
          <p className="muted small" style={{ margin: 0 }}>
            Plans flag hands-on steps that land in these hours, and “Fit around my day” stretches the fridge time (or
            moves a step) so they don’t.
          </p>
          <div className="grid-2">
            <ClockField label="Asleep from" hours={settings.sleepFrom} onChange={(sleepFrom) => setSettings({ sleepFrom })} />
            <ClockField label="Up at" hours={settings.sleepTo} onChange={(sleepTo) => setSettings({ sleepTo })} />
          </div>
          <Switch label="Busy on weekdays (work, school run…)" checked={settings.workOn} onChange={(workOn) => setSettings({ workOn })} />
          {settings.workOn && (
            <div className="grid-2">
              <ClockField label="From" hours={settings.workFrom} onChange={(workFrom) => setSettings({ workFrom })} />
              <ClockField label="Until" hours={settings.workTo} onChange={(workTo) => setSettings({ workTo })} />
            </div>
          )}
        </div>

        <SectionTitle>About</SectionTitle>
        <div className="card prose small">
          <p>
            <b>Pizza Weather</b> — the dough forecast. Everything runs on your device and works offline; your doughs are
            stored only in this browser.
          </p>
          <p className="muted">
            Models: yeast from Craig's pizzamaking.com fermentation data, dough temperature from a heat balance with
            flour hydration heat and mixer calibration, and thermal lag for fridge phases. Treat results as a strong
            starting point and adjust to your flour and kitchen.
          </p>
        </div>
      </main>
    </>
  )
}
