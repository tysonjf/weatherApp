import { Link } from 'react-router'
import { TopBar } from '../../components/Layout'
import { Stars } from '../../components/Stars'
import { Icon } from '../../components/Icon'
import { styleById } from '../../engine/presets'
import { formatHours, formatPct } from '../../engine/units'
import { useSettings, useStore } from '../../state/store'
import { formatDayClock } from '../../lib/time'
import { CalibrationCard } from './CalibrationCard'
import type { JournalEntry } from '../../engine/calibration'

const PROOF: Record<JournalEntry['proof'], { label: string; tone: string }> = {
  under: { label: 'Under-proofed', tone: 'cold' },
  right: { label: 'Just right', tone: 'basil' },
  over: { label: 'Over-proofed', tone: 'warm' },
}

export function JournalEntryCard({ e, showRecipe = true }: { e: JournalEntry; showRecipe?: boolean }) {
  const { timeFormat } = useSettings()
  const deleteJournal = useStore((s) => s.deleteJournal)
  const recipes = useStore((s) => s.recipes)
  const st = styleById(e.styleId)
  return (
    <div className="card">
      <div className="row between">
        <div>
          {showRecipe &&
            (recipes[e.recipeId] ? (
              <Link to={`/recipe/${e.recipeId}`} style={{ fontWeight: 800 }}>
                {st.emoji} {e.recipeName}
              </Link>
            ) : (
              <b>
                {st.emoji} {e.recipeName}
              </b>
            ))}
          <div className="muted small">{formatDayClock(new Date(e.bakedAt), timeFormat)}</div>
        </div>
        <Stars value={e.rating} size={16} />
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <span className={`badge ${PROOF[e.proof].tone}`}>{PROOF[e.proof].label}</span>
        {e.readyOffsetH !== null && (
          <span className="badge">
            {e.readyOffsetH === 0 ? 'Ready on time' : `Ready ${formatHours(Math.abs(e.readyOffsetH))} ${e.readyOffsetH < 0 ? 'early' : 'late'}`}
          </span>
        )}
        <span className="badge">{e.plan.method}</span>
        <span className="badge">
          {formatPct(e.plan.hydration, 0)} · {formatHours(e.plan.totalHours)}
        </span>
      </div>
      {e.notes && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{e.notes}</p>}
      <div style={{ textAlign: 'right' }}>
        <button
          className="btn ghost sm"
          onClick={() => {
            if (confirm('Delete this journal entry?')) deleteJournal(e.id)
          }}
        >
          <Icon name="trash" size={14} /> Delete
        </button>
      </div>
    </div>
  )
}

export function JournalPage() {
  const journal = useStore((s) => s.journal)
  const list = [...journal].sort((a, b) => b.bakedAt - a.bakedAt)
  return (
    <>
      <TopBar title="Bake journal" back="/" />
      <main className="page stack">
        <p className="muted" style={{ margin: 0 }}>
          Every bake you log teaches the forecast: tell it when the dough was really ready and it works out your yeast
          calibration and starter speed.
        </p>
        <CalibrationCard />
        {list.length === 0 ? (
          <div className="card empty">
            <div className="e-emoji">📓</div>
            <p>No bakes logged yet. After a bake, open the dough and tap “How did it go?”.</p>
          </div>
        ) : (
          <div className="stack-sm">
            {list.map((e) => (
              <JournalEntryCard key={e.id} e={e} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
