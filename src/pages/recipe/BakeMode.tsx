import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { TopBar } from '../../components/Layout'
import { Icon } from '../../components/Icon'
import { DEFAULT_PARTY, ovenService, servicePlan } from '../../engine/party'
import { ovenById } from '../../engine/presets'
import { bakeDateOf, useCompute, useComputeOptions, useNow } from '../../state/hooks'
import { useSettings, useStore } from '../../state/store'
import { formatNear } from '../../lib/time'

function beep(times = 1, freq = 880) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = freq
      o.connect(g)
      g.connect(ctx.destination)
      const t = ctx.currentTime + i * 0.25
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      o.start(t)
      o.stop(t + 0.2)
    }
    setTimeout(() => ctx.close(), times * 250 + 400)
  } catch {
    /* no audio */
  }
  navigator.vibrate?.(times > 1 ? [150, 80, 150, 80, 150] : 120)
}

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`

/** Full-screen oven timer: one pizza at a time, turn reminders, balls-out waves, screen kept awake. */
export function BakeMode() {
  const { id } = useParams()
  const recipe = useStore((s) => (id ? s.recipes[id] : undefined))
  const result = useCompute(recipe)
  const opts = useComputeOptions(recipe)
  const { timeFormat } = useSettings()
  const now = useNow(15000)
  const oven = ovenService(recipe?.ovenId ?? 'home-steel')
  const [bakeSec, setBakeSec] = useState(oven.bakeSec)
  const [idx, setIdx] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const lastTurn = useRef(0)
  const doneBeeped = useRef(false)

  // Keep the screen on while baking.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const request = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        lock = wl ? await wl.request('screen') : null
      } catch {
        lock = null
      }
    }
    void request()
    const onVis = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [])

  useEffect(() => {
    if (startedAt === null) return
    const t = setInterval(() => setTick(Date.now()), 250)
    return () => clearInterval(t)
  }, [startedAt])

  const elapsed = startedAt === null ? 0 : (tick - startedAt) / 1000
  const left = bakeSec - elapsed
  useEffect(() => {
    if (startedAt === null) return
    if (oven.turnEverySec > 0 && left > 5) {
      const n = Math.floor(elapsed / oven.turnEverySec)
      if (n > lastTurn.current) {
        lastTurn.current = n
        beep(1, 660)
      }
    }
    if (left <= 0 && !doneBeeped.current) {
      doneBeeped.current = true
      beep(3, 990)
    }
  }, [elapsed, left, oven.turnEverySec, startedAt])

  const bakeMs = recipe ? bakeDateOf(recipe).getTime() : 0
  const plan = useMemo(() => {
    if (!recipe || !result) return null
    const party = { ...DEFAULT_PARTY, ...(recipe.party ?? {}) }
    return servicePlan(recipe, result, bakeMs, result.pieces, party.cadenceMin ?? oven.cadenceMin, oven.capacity, opts)
  }, [recipe, result, bakeMs, oven.cadenceMin, oven.capacity, opts])

  if (!recipe) return <Navigate to="/" replace />
  if (!result || !plan) return null
  const total = result.pieces
  const turning = startedAt !== null && oven.turnEverySec > 0 && left > 0 && elapsed % oven.turnEverySec < 2.5 && elapsed > 2.5
  const start = () => {
    lastTurn.current = 0
    doneBeeped.current = false
    setStartedAt(Date.now())
    setTick(Date.now())
  }
  const next = () => {
    setStartedAt(null)
    setIdx((i) => Math.min(total, i + 1))
  }
  const waves = plan.waves.filter((w) => w.atMs > now.getTime() - 5 * 60000)

  return (
    <>
      <TopBar title={`Bake: ${recipe.name}`} back={`/recipe/${recipe.id}?tab=party`} />
      <main className="page stack bake-mode">
        {idx >= total ? (
          <div className="card empty">
            <div className="e-emoji">🎉</div>
            <p>All {total} baked. Buon appetito!</p>
            <button className="btn soft" onClick={() => setIdx(0)}>
              Start over
            </button>
          </div>
        ) : (
          <>
            <div className="muted">
              {recipe.sizing.mode === 'pans' ? 'Pan' : 'Pizza'} <b>{idx + 1}</b> of {total} · {ovenById(recipe.ovenId).name}
            </div>
            <div className="dial" style={{ '--p': startedAt === null ? 0 : Math.min(1, elapsed / bakeSec) } as React.CSSProperties}>
              <div>
                <div className="t">{mmss(startedAt === null ? bakeSec : left)}</div>
                {turning ? <div className="turn">Turn it!</div> : <div className="muted small">{left <= 0 && startedAt !== null ? 'Out it comes' : startedAt ? 'baking' : 'ready'}</div>}
              </div>
            </div>
            {startedAt === null ? (
              <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
                <button className="btn soft" aria-label="Shorter" onClick={() => setBakeSec((s) => Math.max(30, s - 15))}>
                  −15 s
                </button>
                <button className="btn primary" onClick={start}>
                  <Icon name="play" size={18} /> In the oven
                </button>
                <button className="btn soft" aria-label="Longer" onClick={() => setBakeSec((s) => s + 15)}>
                  +15 s
                </button>
              </div>
            ) : (
              <button className="btn primary block" onClick={next}>
                <Icon name="check" size={18} /> Out — next one
              </button>
            )}
            <p className="muted small" style={{ margin: 0 }}>
              {oven.turnEverySec > 0 ? `Beeps every ${oven.turnEverySec} s to turn, three beeps when it’s done.` : 'Three beeps when it’s done; turn it once halfway.'} The screen stays on.
            </p>
          </>
        )}
        {waves.length > 0 && (
          <div className="card" style={{ textAlign: 'left' }}>
            <b>Balls out of the fridge</b>
            <ul className="waves">
              {waves.map((w) => (
                <li key={w.atMs}>
                  {formatNear(new Date(w.atMs), now, timeFormat)} — {w.count} ball{w.count > 1 ? 's' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  )
}
