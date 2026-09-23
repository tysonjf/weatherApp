import { Link, Navigate, useParams } from 'react-router'
import { TopBar } from '../components/Layout'
import { Icon } from '../components/Icon'
import { localizeNode } from '../lib/localizeNode'
import { GUIDES } from '../content/guides'
import { localizeTemps } from '../engine/units'
import { useSettings } from '../state/store'

export function GuidesPage() {
  const { tempUnit } = useSettings()
  return (
    <>
      <TopBar title="Guides" />
      <main className="page stack">
        <p className="muted">The why behind the numbers — and what to look for at every step.</p>
        <div className="stack-sm">
          {GUIDES.map((g) => (
            <Link key={g.id} to={`/guides/${g.id}`} className="recipe-item">
              <span className="ri-emoji">{g.emoji}</span>
              <span className="grow">
                <div className="ri-title">{g.title}</div>
                <div className="ri-sub">{localizeTemps(g.summary, tempUnit)}</div>
              </span>
              <Icon name="chevronRight" />
            </Link>
          ))}
        </div>
      </main>
    </>
  )
}

export function GuidePage() {
  const { tempUnit } = useSettings()
  const { id } = useParams()
  const guide = GUIDES.find((g) => g.id === id)
  if (!guide) return <Navigate to="/guides" replace />
  return (
    <>
      <TopBar title={guide.title} back="/guides" />
      <main className="page">
        <div className="card prose">
          <div style={{ fontSize: '2.2rem' }}>{guide.emoji}</div>
          <h1>{guide.title}</h1>
          {localizeNode(guide.body, tempUnit)}
        </div>
      </main>
    </>
  )
}
