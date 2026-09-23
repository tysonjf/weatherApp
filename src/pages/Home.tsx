import { useMemo } from 'react'
import { Link } from 'react-router'
import { TopBar } from '../components/Layout'
import { Icon } from '../components/Icon'
import { WeatherCard } from '../components/WeatherCard'
import { SectionTitle } from '../components/ui'
import { styleById } from '../engine/presets'
import { computeRecipe } from '../engine/compute'
import { formatHours, formatWeight } from '../engine/units'
import { useNow, bakeDateOf, atTime, optionsFor } from '../state/hooks'
import { useSettings, useStore } from '../state/store'
import { methodLabel } from '../state/recipes'
import { formatDayClock } from '../lib/time'


export function HomePage() {
  const settings = useSettings()
  const recipes = useStore((s) => s.recipes)
  const journalCount = useStore((s) => s.journal.length)
  const now = useNow(60000)
  const list = useMemo(() => Object.values(recipes).sort((a, b) => b.updatedAt - a.updatedAt), [recipes])
  const computed = useMemo(
    () =>
      list.flatMap((r) => {
        try {
          return [{ r, res: computeRecipe(r, { ...optionsFor(settings, r), bakeAtMs: bakeDateOf(r).getTime() }) }]
        } catch (e) {
          console.error(e)
          return []
        }
      }),
    [list, settings],
  )

  const active = computed
    .map(({ r, res }) => {
      const bake = bakeDateOf(r)
      const nowH = (now.getTime() - bake.getTime()) / 3600000
      const next = res.timeline.find((e) => e.atH >= nowH)
      return { r, res, bake, nowH, next }
    })
    .filter((x) => x.nowH >= -x.res.totalHours - 1 && x.nowH <= 1)

  return (
    <>
      <TopBar brand />
      <main className="page stack">
        <div className="hero">
          <div className="muted small">The dough forecast</div>
          <h1 style={{ margin: '4px 0 6px' }}>Pizza Weather</h1>
          <p className="muted" style={{ margin: 0 }}>
            Direct, biga, poolish, sourdough — or all of them at once. Time, temperature and water, worked out to the
            gram and the degree.
          </p>
          <div className="row" style={{ marginTop: 14 }}>
            <Link to="/new" className="btn primary">
              <Icon name="plus" size={18} /> New dough
            </Link>
            <Link to="/tools/water" className="btn" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'transparent' }}>
              <Icon name="thermo" size={18} /> Water temp
            </Link>
          </div>
        </div>

        {active.length > 0 && (
          <>
            <SectionTitle>In progress</SectionTitle>
            <div className="stack-sm">
              {active.map(({ r, res, bake, next }) => {
                const st = styleById(r.styleId)
                const progress = Math.min(1, Math.max(0, (now.getTime() - atTime(bake, -res.totalHours).getTime()) / (res.totalHours * 3600000)))
                return (
                  <Link key={r.id} to={`/recipe/${r.id}?tab=guide`} className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                    <div className="row">
                      <span style={{ fontSize: '1.6rem' }}>{st.emoji}</span>
                      <div className="grow">
                        <div style={{ fontWeight: 800 }}>{r.name}</div>
                        <div className="muted small">Bake {formatDayClock(bake, settings.timeFormat)}</div>
                      </div>
                      <Icon name="chevronRight" />
                    </div>
                    {next && (
                      <div className="small" style={{ marginTop: 8 }}>
                        Next: <b>{next.title}</b>{' '}
                        <span className="muted">
                          {formatDayClock(atTime(bake, next.atH), settings.timeFormat)} (in {formatHours(Math.max(0, next.atH - (now.getTime() - bake.getTime()) / 3600000))})
                        </span>
                      </div>
                    )}
                    <div className="meter" style={{ marginTop: 8 }}>
                      <span style={{ width: `${progress * 100}%` }} />
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}

        <WeatherCard />

        {journalCount > 0 && (
          <Link to="/journal" className="recipe-item">
            <span className="ri-emoji">📓</span>
            <span className="grow">
              <div className="ri-title">Bake journal</div>
              <div className="ri-sub">
                {journalCount} bake{journalCount > 1 ? 's' : ''} logged — the forecast learns from them
              </div>
            </span>
            <Icon name="chevronRight" />
          </Link>
        )}

        <SectionTitle>My doughs</SectionTitle>
        {list.length === 0 ? (
          <div className="card empty">
            <div className="e-emoji">🍕</div>
            <p>No doughs yet. Start one — it takes a minute.</p>
            <Link to="/new" className="btn primary">
              <Icon name="plus" size={18} /> New dough
            </Link>
          </div>
        ) : (
          <div className="stack-sm">
            {list.map((r) => {
              const st = styleById(r.styleId)
              const pieces = r.sizing.mode === 'balls' ? `${r.sizing.count} × ${formatWeight(r.sizing.ballWeight, settings.weightUnit)}` : `${r.sizing.count} pan${r.sizing.count > 1 ? 's' : ''}`
              return (
                <Link key={r.id} to={`/recipe/${r.id}`} className="recipe-item">
                  <span className="ri-emoji">{st.emoji}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="ri-title">{r.name}</div>
                    <div className="ri-sub">
                      {pieces} · {r.hydration}% · {methodLabel(r)}
                    </div>
                  </span>
                  <Icon name="chevronRight" />
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
