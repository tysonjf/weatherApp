import { useState } from 'react'
import { describeWeather, doughOutlook, fetchLocalWeather, readCachedWeather, type LocalWeather } from '../lib/weather'
import { formatTemp } from '../engine/units'
import { formatClock } from '../lib/time'
import { useSettings } from '../state/store'
import { Icon } from './Icon'
import { useNow } from '../state/hooks'

/** Optional local conditions (Open-Meteo), only fetched when the user asks. */
export function WeatherCard({ onUseTemp }: { onUseTemp?: (c: number) => void }) {
  const { tempUnit, timeFormat } = useSettings()
  const [weather, setWeather] = useState<LocalWeather | null>(() => {
    const w = readCachedWeather()
    return w && Date.now() - w.fetchedAt < 3 * 3600000 ? w : null // initializer runs once
  })
  const [loading, setLoading] = useState(false)
  const now = useNow(60000).getTime()
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setWeather(await fetchLocalWeather())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the weather.')
    } finally {
      setLoading(false)
    }
  }

  if (!weather)
    return (
      <div className="card row">
        <span style={{ fontSize: '1.8rem' }}>🌤️</span>
        <div className="grow">
          <div style={{ fontWeight: 750 }}>Today’s pizza weather</div>
          <div className="muted small">{error ?? 'Outdoor temperature and a dough outlook for your area (uses your location once).'}</div>
        </div>
        <button className="btn soft sm" onClick={load} disabled={loading}>
          <Icon name="location" size={16} />
          {loading ? 'Checking…' : 'Check'}
        </button>
      </div>
    )

  const d = describeWeather(weather.code)
  const next = weather.hourly.filter((h) => h.time > now && h.time < now + 24 * 3600000)
  const lo = next.length ? Math.min(...next.map((h) => h.tempC)) : weather.tempC
  const hi = next.length ? Math.max(...next.map((h) => h.tempC)) : weather.tempC
  return (
    <div className="card stack-sm">
      <div className="row">
        <span style={{ fontSize: '2rem' }}>{d.emoji}</span>
        <div className="grow">
          <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>
            {formatTemp(weather.tempC, tempUnit, 0)} outside · {weather.humidity}% RH
          </div>
          <div className="muted small">
            {d.text}. Next 24 h {formatTemp(lo, tempUnit, 0)}–{formatTemp(hi, tempUnit, 0)} · updated {formatClock(new Date(weather.fetchedAt), timeFormat)}
          </div>
        </div>
        <button className="icon-btn" aria-label="Refresh weather" onClick={load} disabled={loading}>
          <Icon name="refresh" size={18} />
        </button>
      </div>
      <p className="small" style={{ margin: 0 }}>{doughOutlook(weather)}</p>
      {onUseTemp && (
        <button className="btn soft sm" onClick={() => onUseTemp(Math.round(weather.tempC * 2) / 2)}>
          Use {formatTemp(weather.tempC, tempUnit, 0)} as my room temperature
        </button>
      )}
    </div>
  )
}
