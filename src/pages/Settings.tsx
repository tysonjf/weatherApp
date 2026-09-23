import { useState } from 'react'
import { Link } from 'react-router'
import { TopBar } from '../components/Layout'
import { Icon } from '../components/Icon'
import { CalibrationCard } from './journal/CalibrationCard'
import { doublingsForSeed, sdDoublingHours } from '../engine/fermentation'
import { pressureRatio } from '../engine/altitude'
import { formatHours } from '../engine/units'
import { ClockField, NumberField, Segmented, SelectField, Switch, TempDeltaField, TempField } from '../components/fields'
import { SectionTitle } from '../components/ui'
import { MIXERS, mixerById } from '../engine/mixers'
import type { YeastType } from '../engine/types'
import { formatTempDelta } from '../engine/units'
import { YEAST_LABEL } from '../engine/yeastTypes'
import { makeBackup, parseBackup, useSettings, useStore } from '../state/store'
import { downloadText } from '../lib/ics'

export function SettingsPage() {
  const settings = useSettings()
  const importBackup = useStore((s) => s.importBackup)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const exportAll = () => {
    const s = useStore.getState()
    const day = new Date().toISOString().slice(0, 10)
    downloadText(`pizza-weather-backup-${day}.json`, JSON.stringify(makeBackup(s), null, 2), 'application/json')
    setBackupMsg(`Saved ${Object.keys(s.recipes).length} doughs and ${s.journal.length} journal entries.`)
  }
  const importFile = async (file: File) => {
    try {
      const b = parseBackup(JSON.parse(await file.text()))
      if (!b) {
        setBackupMsg('That file isn’t a Pizza Weather backup.')
        return
      }
      const withSettings = confirm('Also restore the settings from the backup (units, kitchen, calibrations)?')
      const n = importBackup(b, withSettings)
      setBackupMsg(`Restored ${n.recipes} doughs and ${n.journal} journal entries${withSettings ? ' and your settings' : ''}.`)
    } catch {
      setBackupMsg('Couldn’t read that file.')
    }
  }
  const [peakH, setPeakH] = useState(5)
  const [peakC, setPeakC] = useState(24)
  const modelPeak = doublingsForSeed(1) * sdDoublingHours(peakC)
  const measuredSpeed = Math.min(3, Math.max(0.3, modelPeak / Math.max(0.5, peakH)))
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

        <SectionTitle>Your scale</SectionTitle>
        <div className="card stack">
          <div className="field">
            <span className="label">My scale reads to</span>
            <Segmented
              ariaLabel="Scale resolution"
              value={String(settings.scaleStepG) as '1' | '0.1' | '0.01'}
              onChange={(v) => setSettings({ scaleStepG: Number(v) })}
              options={[
                { value: '1', label: '1 g' },
                { value: '0.1', label: '0.1 g' },
                { value: '0.01', label: '0.01 g' },
              ]}
            />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Yeast below about five steps of your scale gets a teaspoon measure and the 1 % solution trick.
          </p>
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
          <Switch
            label="Show classic DDT formula"
            hint="Also show the bakers' 3×/4× friction-factor answer next to the heat-balance water temperature."
            checked={settings.showClassicDdt}
            onChange={(showClassicDdt) => setSettings({ showClassicDdt })}
          />
        </div>

        <SectionTitle>Calibration</SectionTitle>
        <div className="card stack">
          <p className="muted small" style={{ margin: 0 }}>
            The forecast learns from your <Link to="/journal">bake journal</Link>: log when the dough was really ready
            and it suggests these for you.
          </p>
          <NumberField
            label="Yeast calibration"
            value={Math.round(settings.yeastScale * 100)}
            onChange={(v) => setSettings({ yeastScale: v / 100 })}
            unit="%"
            step={5}
            min={50}
            max={200}
            decimals={0}
            hint="100 % = the model as is. If your yeasted doughs are consistently slow, raise it (e.g. 120 %); if they over-proof, lower it."
          />
          <NumberField
            label="Starter speed"
            value={Math.round(settings.starterSpeed * 100)}
            onChange={(v) => setSettings({ starterSpeed: v / 100 })}
            unit="%"
            step={5}
            min={30}
            max={300}
            decimals={0}
            hint="How lively your sourdough starter is compared with the model: 80 % means it takes 25 % longer to rise."
          />
          <details className="details">
            <summary>Measure your starter</summary>
            <div className="details-body stack-sm">
              <p className="muted small" style={{ margin: 0 }}>
                Feed it 1 : 1 : 1 (starter : flour : water), keep it somewhere steady and note when it peaks (domed, about
                to fall).
              </p>
              <div className="grid-2">
                <NumberField label="It peaked after" value={peakH} onChange={setPeakH} unit="h" step={0.5} min={1} max={24} decimals={1} />
                <TempField label="At about" valueC={peakC} onChangeC={setPeakC} minC={10} maxC={35} />
              </div>
              <div className="row between wrap">
                <span className="small">
                  The model expects {formatHours(modelPeak)} → speed <b>{Math.round(measuredSpeed * 100)} %</b>
                </span>
                <button className="btn soft sm" onClick={() => setSettings({ starterSpeed: Math.round(measuredSpeed * 100) / 100 })}>
                  Use it
                </button>
              </div>
            </div>
          </details>
          <NumberField
            label="Altitude"
            value={settings.altitudeM}
            onChange={(altitudeM) => setSettings({ altitudeM })}
            unit="m"
            step={100}
            min={-400}
            max={5000}
            decimals={0}
            hint={
              settings.altitudeM > 300
                ? `Thinner air: dough rises on ${Math.round((1 - pressureRatio(settings.altitudeM)) * 100)} % less fermentation, so yeast and starter are cut to match.`
                : 'Above ~1,000 m dough rises faster on the same yeast; the app corrects for it.'
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <CalibrationCard />
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

        <SectionTitle>Backup</SectionTitle>
        <div className="card stack">
          <p className="muted small" style={{ margin: 0 }}>
            Everything lives in this browser only. Save a backup file now and then — or to move to another device.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn soft" onClick={exportAll}>
              <Icon name="download" size={18} /> Save a backup
            </button>
            <label className="btn soft" style={{ cursor: 'pointer' }}>
              <Icon name="upload" size={18} /> Restore…
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importFile(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {backupMsg && <div className="small">{backupMsg}</div>}
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
