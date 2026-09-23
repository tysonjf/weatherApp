import { suggestCalibration } from '../../engine/calibration'
import { useSettings, useStore } from '../../state/store'

const pct = (v: number) => `${Math.round(v * 100)} %`

/** Suggests new yeast / starter calibrations from the journal, one tap to apply. */
export function CalibrationCard() {
  const journal = useStore((s) => s.journal)
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  const sug = suggestCalibration(journal)
  const rows: { label: string; cur: number; next: number; n: number; apply: () => void; hint: string }[] = []
  if (sug.yeast && Math.abs(sug.yeast.value / settings.yeastScale - 1) >= 0.04)
    rows.push({
      label: 'Yeast calibration',
      cur: settings.yeastScale,
      next: sug.yeast.value,
      n: sug.yeast.n,
      apply: () => setSettings({ yeastScale: Math.round(sug.yeast!.value * 100) / 100 }),
      hint: sug.yeast.value > settings.yeastScale ? 'Your yeasted doughs run slower than forecast.' : 'Your yeasted doughs run faster than forecast.',
    })
  if (sug.starter && Math.abs(sug.starter.value / settings.starterSpeed - 1) >= 0.04)
    rows.push({
      label: 'Starter speed',
      cur: settings.starterSpeed,
      next: sug.starter.value,
      n: sug.starter.n,
      apply: () => setSettings({ starterSpeed: Math.round(sug.starter!.value * 100) / 100 }),
      hint: sug.starter.value < settings.starterSpeed ? 'Your starter is slower than the model.' : 'Your starter is livelier than the model.',
    })
  if (!rows.length) return null
  return (
    <div className="card stack-sm">
      <h3 style={{ margin: 0 }}>Learned from your bakes</h3>
      {rows.map((r) => (
        <div key={r.label} className="row between wrap">
          <div>
            <b>{r.label}</b>: {pct(r.cur)} → <b>{pct(r.next)}</b>
            <div className="muted small">
              {r.hint} Based on {r.n} bake{r.n > 1 ? 's' : ''}.
            </div>
          </div>
          <button className="btn soft sm" onClick={r.apply}>
            Apply
          </button>
        </div>
      ))}
    </div>
  )
}
