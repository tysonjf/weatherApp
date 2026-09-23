import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { TopBar } from '../../components/Layout'
import { Icon } from '../../components/Icon'
import { AdviceList, Alert, Sheet } from '../../components/ui'
import { StageCard } from '../../components/StageCard'
import { Timeline } from '../../components/Timeline'
import { TempChart } from '../../components/TempChart'
import { RipenessChart } from '../../components/RipenessChart'
import { NumberField, WeightField } from '../../components/fields'
import { useSettings, useStore } from '../../state/store'
import { atTime, bakeDateOf, useCompute, useNow } from '../../state/hooks'
import { styleById } from '../../engine/presets'
import { formatHours, formatPct, formatWeight } from '../../engine/units'
import { formatDayClock, formatNear, fromLocalInput, roundUp5, toLocalInput } from '../../lib/time'
import { buildIcs, downloadText } from '../../lib/ics'
import { shareUrl } from '../../state/share'
import { GuideTab } from './GuideTab'
import { FormulaTab } from './FormulaTab'
import { LiveCard } from './LiveCard'
import { PartyTab } from './PartyTab'
import { FitCard } from '../../components/FitCard'
import { JournalSheet } from '../journal/JournalSheet'
import { JournalEntryCard } from '../journal/JournalPage'
import { resetLive } from '../../engine/replan'

type Tab = 'recipe' | 'forecast' | 'guide' | 'party' | 'formula'

export function RecipePage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const recipe = useStore((s) => (id ? s.recipes[id] : undefined))
  const saveRecipe = useStore((s) => s.saveRecipe)
  const setDraft = useStore((s) => s.setDraft)
  const deleteRecipe = useStore((s) => s.deleteRecipe)
  const duplicateRecipe = useStore((s) => s.duplicateRecipe)
  const progress = useStore((s) => (id ? s.progress[id] : undefined))
  const toggleStep = useStore((s) => s.toggleStep)
  const settings = useSettings()
  const navigate = useNavigate()
  const now = useNow(30000)
  const result = useCompute(recipe)
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const checked = useMemo(() => new Set(progress ?? []), [progress])
  const [chartStage, setChartStage] = useState('final')
  const [logging, setLogging] = useState(false)
  const journal = useStore((s) => s.journal)
  const resetProgress = useStore((s) => s.resetProgress)

  if (!recipe) return <Navigate to="/" replace />
  const tab = (params.get('tab') as Tab) || 'recipe'
  const setTab = (t: Tab) => setParams(t === 'recipe' ? {} : { tab: t }, { replace: true })
  const st = styleById(recipe.styleId)
  const bake = bakeDateOf(recipe)
  const start = result ? atTime(bake, -result.totalHours) : null
  const win = result?.window
  const clock = (h: number | null) => (h === null ? null : formatNear(atTime(bake, h), bake, settings.timeFormat))
  const late = start ? start.getTime() < now.getTime() - 10 * 60000 && bake.getTime() > now.getTime() : false
  const wu = settings.weightUnit

  const edit = () => {
    setDraft(structuredClone(recipe))
    navigate('/wizard/style')
  }
  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }
  const share = async () => {
    const url = shareUrl(recipe)
    try {
      if (navigator.share) await navigator.share({ title: recipe.name, text: `${recipe.name} — Pizza Weather dough plan`, url })
      else {
        await navigator.clipboard.writeText(url)
        flash('Link copied')
      }
    } catch {
      /* cancelled */
    }
  }
  const exportIcs = () => {
    if (!result) return
    const ics = buildIcs(
      `${recipe.name} · Pizza Weather`,
      result.timeline.map((e) => ({
        uid: `${recipe.id}-${e.id}`,
        title: `🍕 ${e.title}`,
        description: e.detail,
        start: atTime(bake, e.atH),
        durationMin: e.durationMin,
      })),
    )
    downloadText(`${recipe.name.replace(/[^\w-]+/g, '-')}.ics`, ics, 'text/calendar')
    setMenu(false)
  }
  const update = (patch: Partial<typeof recipe>) => saveRecipe({ ...recipe, ...patch })
  const bakes = journal.filter((e) => e.recipeId === recipe.id).sort((a, b) => b.bakedAt - a.bakedAt)
  const logged = bakes.some((e) => Math.abs(e.bakedAt - bake.getTime()) < 12 * 3600000)
  const bakeDue = now.getTime() >= bake.getTime() - 30 * 60000
  const bakeAgain = () => {
    saveRecipe(resetLive(recipe))
    resetProgress(recipe.id)
    setMenu(false)
    flash('Fresh plan ready')
  }

  return (
    <>
      <TopBar
        title={recipe.name}
        back="/"
        actions={
          <>
            <button className="icon-btn" aria-label="Edit" onClick={edit}>
              <Icon name="edit" />
            </button>
            <button className="icon-btn" aria-label="Share" onClick={share}>
              <Icon name="share" />
            </button>
            <button className="icon-btn" aria-label="More" onClick={() => setMenu(true)}>
              <Icon name="sliders" />
            </button>
          </>
        }
      />
      <main className="page">
        {result ? (
          <div className="hero">
            <div className="muted small">
              {st.emoji} {st.name} · {result.pieces} × {formatWeight(result.pieceWeight, wu)}
            </div>
            <h2 style={{ margin: '6px 0 2px' }}>Bake {formatDayClock(bake, settings.timeFormat)}</h2>
            {start && (
              <div className="muted small">
                Start {formatDayClock(start, settings.timeFormat)} · {formatHours(result.totalHours)} forecast
              </div>
            )}
            {win && (
              <div className="small" style={{ marginTop: 6 }}>
                🎯 Bakes well {clock(win.readyH) ?? 'later'} – {win.untilH === null ? 'late' : clock(win.untilH)}
                {win.bestH !== null && Math.abs(win.bestH) > 0.3 && (
                  <span className="muted"> · peaks {clock(win.bestH)}</span>
                )}
              </div>
            )}
            <div className="hero-stats">
              <div className="hero-stat">
                <div className="k">Dough</div>
                <div className="v">{formatWeight(result.totals.dough, wu)}</div>
              </div>
              <div className="hero-stat">
                <div className="k">Hydration</div>
                <div className="v">{formatPct(recipe.hydration, 1)}</div>
              </div>
              <div className="hero-stat">
                <div className="k">Salt</div>
                <div className="v">{formatPct(recipe.saltPct, 1)}</div>
              </div>
            </div>
          </div>
        ) : (
          <Alert severity="error" title="This recipe could not be calculated">
            Open it in the editor and check the numbers.
          </Alert>
        )}

        {result && <LiveCard recipe={recipe} result={result} bake={bake} now={now} />}

        {result && bakeDue && (
          <div className="card" style={{ marginTop: 12 }}>
            {logged ? (
              <div className="row between wrap">
                <span>📓 Logged in your journal.</span>
                <button className="btn soft sm" onClick={bakeAgain}>
                  <Icon name="refresh" size={16} /> Bake it again
                </button>
              </div>
            ) : (
              <div className="row between wrap">
                <span>
                  <b>How did it go?</b>
                  <span className="muted small" style={{ display: 'block' }}>
                    A 20-second note makes the next forecast better.
                  </span>
                </span>
                <button className="btn primary sm" onClick={() => setLogging(true)}>
                  <Icon name="star" size={16} /> Log this bake
                </button>
              </div>
            )}
          </div>
        )}

        {late && !Object.keys(recipe.live?.mixed ?? {}).length && (
          <div style={{ marginTop: 12 }}>
            <Alert severity="warn" title="The first step was due already">
              <div className="row wrap" style={{ marginTop: 6 }}>
                <button
                  className="btn soft sm"
                  onClick={() => result && update({ bakeAt: roundUp5(new Date(Date.now() + result.totalHours * 3600000)).toISOString() })}
                >
                  Start now instead
                </button>
              </div>
            </Alert>
          </div>
        )}

        <div className="tabs" role="tablist">
          {(
            [
              ['recipe', 'Recipe'],
              ['forecast', 'Forecast'],
              ['guide', 'Bake guide'],
              ['party', 'Pizza night'],
              ['formula', 'Formula'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>

        {result && tab === 'recipe' && (
          <div className="stack">
            <div className="card">
              <div className="grid-2">
                {recipe.sizing.mode === 'balls' ? (
                  <>
                    <NumberField
                      label="Balls"
                      value={recipe.sizing.count}
                      onChange={(count) => update({ sizing: { ...recipe.sizing, count } })}
                      min={1}
                      max={200}
                      decimals={0}
                    />
                    <WeightField
                      label="Each"
                      grams={recipe.sizing.ballWeight}
                      onChange={(ballWeight) => update({ sizing: { ...recipe.sizing, ballWeight } })}
                      min={50}
                      max={3000}
                    />
                  </>
                ) : (
                  <NumberField
                    label="Pans"
                    value={recipe.sizing.count}
                    onChange={(count) => update({ sizing: { ...recipe.sizing, count } })}
                    min={1}
                    max={50}
                    decimals={0}
                  />
                )}
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label htmlFor="bake-quick">Bake time</label>
                <input
                  id="bake-quick"
                  className="textbox"
                  type="datetime-local"
                  value={toLocalInput(bake)}
                  onChange={(e) => {
                    const d = fromLocalInput(e.target.value)
                    if (d) update({ bakeAt: d.toISOString() })
                  }}
                />
              </div>
            </div>
            <FitCard recipe={recipe} result={result} bake={bake} onApply={(next) => saveRecipe(next)} />
            <AdviceList advice={result.advice.filter((a) => a.severity !== 'info')} />
            {result.stages.map((s) => (
              <StageCard key={s.id} stage={s} recipe={recipe} bake={bake} checked={checked} onToggle={(k) => toggleStep(recipe.id, k)} />
            ))}
            <p className="muted small center">Tap an ingredient to tick it off as you weigh it.</p>
            {bakes.length > 0 && (
              <>
                <h3 style={{ margin: '8px 0 0' }}>Past bakes</h3>
                {bakes.map((e) => (
                  <JournalEntryCard key={e.id} e={e} showRecipe={false} />
                ))}
              </>
            )}
            {recipe.notes && (
              <div className="card soft">
                <h4>Notes</h4>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{recipe.notes}</p>
              </div>
            )}
          </div>
        )}

        {result && tab === 'forecast' && (
          <div className="stack">
            <div className="card">
              <div className="card-head">
                <h3>Dough temperature</h3>
              </div>
              {result.stages.length > 1 && (
                <div className="row wrap" style={{ marginBottom: 10 }}>
                  {result.stages.map((s) => (
                    <button key={s.id} className={`chip${chartStage === s.id ? ' on' : ''}`} onClick={() => setChartStage(s.id)}>
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
              <TempChart stage={result.stages.find((s) => s.id === chartStage) ?? result.stages[result.stages.length - 1]} bake={bake} now={now} />
            </div>
            <div className="card">
              <div className="card-head">
                <h3>Ripeness</h3>
              </div>
              <RipenessChart
                stage={result.stages.find((s) => s.id === chartStage) ?? result.stages[result.stages.length - 1]}
                after={result.window.after}
                bake={bake}
                now={now}
              />
            </div>
            <FitCard recipe={recipe} result={result} bake={bake} onApply={(next) => saveRecipe(next)} />
            <div className="card">
              <div className="card-head">
                <h3>Forecast</h3>
                <button className="btn soft sm badge" onClick={exportIcs}>
                  <Icon name="calendar" size={14} /> Add to calendar
                </button>
              </div>
              <Timeline events={result.timeline} bake={bake} now={now} />
            </div>
          </div>
        )}

        {result && tab === 'guide' && <GuideTab recipe={recipe} result={result} bake={bake} now={now} />}
        {result && tab === 'party' && <PartyTab recipe={recipe} result={result} bake={bake} />}
        {result && tab === 'formula' && <FormulaTab recipe={recipe} result={result} />}
      </main>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Dough options">
        <div className="stack-sm">
          <button className="btn block" onClick={exportIcs}>
            <Icon name="calendar" /> Add all steps to calendar (.ics)
          </button>
          <button
            className="btn block"
            onClick={() => {
              setMenu(false)
              setTimeout(() => window.print(), 100)
            }}
          >
            <Icon name="print" /> Print
          </button>
          <button
            className="btn block"
            onClick={() => {
              const newId = duplicateRecipe(recipe.id)
              setMenu(false)
              if (newId) navigate(`/recipe/${newId}`)
            }}
          >
            <Icon name="copy" /> Duplicate
          </button>
          <button className="btn block" onClick={share}>
            <Icon name="share" /> Share link
          </button>
          {result && (
            <button
              className="btn block"
              onClick={() => {
                setMenu(false)
                setLogging(true)
              }}
            >
              <Icon name="star" /> Log a bake in the journal
            </button>
          )}
          <button className="btn block" onClick={bakeAgain}>
            <Icon name="refresh" /> Start over with a fresh plan
          </button>
          <button
            className="btn block danger"
            onClick={() => {
              if (confirm(`Delete “${recipe.name}”?`)) {
                deleteRecipe(recipe.id)
                navigate('/', { replace: true })
              }
            }}
          >
            <Icon name="trash" /> Delete
          </button>
        </div>
      </Sheet>
      {logging && result && <JournalSheet recipe={recipe} result={result} bake={bake} onClose={() => setLogging(false)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
