import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { StageResult } from '../engine/types'
import { cToF, formatTemp } from '../engine/units'
import { atTime } from '../state/hooks'
import { formatClock, formatDay } from '../lib/time'
import { useSettings } from '../state/store'
import { Details } from './ui'
import { CHART_PAD as PAD, nearestIndex, timeTicks, useWidth } from './chartKit'

const H = 210
const toUnit = (c: number, unit: 'C' | 'F') => (unit === 'F' ? cToF(c) : c)

/**
 * The dough's "weather": simulated dough temperature against the air it sits in,
 * with fridge / room phases as background bands. Hover or arrow keys read values.
 */
export function TempChart({ stage, bake, now }: { stage: StageResult; bake: Date; now?: Date }) {
  const { tempUnit, timeFormat } = useSettings()
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const [wrapRef, W] = useWidth()
  const pts = stage.curve

  const conv = (c: number) => toUnit(c, tempUnit)
  const model = useMemo(() => {
    const conv = (c: number) => toUnit(c, tempUnit)
    if (pts.length < 2) return null
    const t0 = pts[0].t
    const t1 = pts[pts.length - 1].t
    const temps = pts.flatMap((p) => [conv(p.doughC), conv(p.envC)])
    const step = tempUnit === 'F' ? 10 : 5
    const yMin = Math.floor((Math.min(...temps) - 1) / step) * step
    const yMax = Math.ceil((Math.max(...temps) + 1) / step) * step
    const x = (t: number) => PAD.l + ((t - t0) / Math.max(0.01, t1 - t0)) * (W - PAD.l - PAD.r)
    const y = (v: number) => PAD.t + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * (H - PAD.t - PAD.b)
    const yTicks: number[] = []
    for (let v = yMin; v <= yMax + 0.001; v += step) yTicks.push(v)
    const xTicks = timeTicks(bake, t0, t1, W, timeFormat)
    const dough = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(conv(p.doughC)).toFixed(1)}`).join('')
    // Air steps when the dough moves (room ⇄ fridge) and drifts smoothly with the room's daily cycle.
    let air = ''
    pts.forEach((p, i) => {
      const X = x(p.t).toFixed(1)
      const Y = y(conv(p.envC)).toFixed(1)
      if (i === 0) air += `M${X},${Y}`
      else if (Math.abs(p.envC - pts[i - 1].envC) > 1.5) air += `L${X},${y(conv(pts[i - 1].envC)).toFixed(1)}L${X},${Y}`
      else air += `L${X},${Y}`
    })
    return { t0, t1, x, y, yTicks, xTicks, dough, air }
  }, [pts, tempUnit, timeFormat, bake, W])

  if (!model) return null
  const { x, y } = model
  const bands: { from: number; to: number; loc: string }[] = []
  const firstPhaseStart = stage.phases[0]?.startH ?? model.t0
  if (firstPhaseStart > model.t0 + 0.01) bands.push({ from: model.t0, to: firstPhaseStart, loc: 'room' })
  for (const p of stage.phases) bands.push({ from: p.startH, to: p.endH, loc: p.location })

  const pickIndex = (clientX: number) => {
    const svg = ref.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    const t = model.t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (model.t1 - model.t0)
    return nearestIndex(pts, t)
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => setHover(pickIndex(e.clientX))
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const cur = hover ?? 0
    setHover(Math.max(0, Math.min(pts.length - 1, cur + (e.key === 'ArrowRight' ? 2 : -2))))
  }
  const hp = hover !== null ? pts[hover] : null
  const phaseAt = (t: number) => bands.find((b) => t >= b.from - 1e-6 && t <= b.to + 1e-6)?.loc ?? 'room'
  const nowT = now ? (now.getTime() - bake.getTime()) / 3600000 : null
  const u = tempUnit

  // Table view: roughly every 2 h.
  const tableStep = Math.max(1, Math.round((model.t1 - model.t0) / 12))
  const tableRows = pts.filter((p, i) => i === 0 || i === pts.length - 1 || Math.abs((p.t - model.t0) % tableStep) < 0.13)

  return (
    <div>
      <div className="legend" aria-hidden="true">
        <span>
          <span className="lk" style={{ background: 'var(--viz-dough)' }} />
          Dough temperature
        </span>
        <span>
          <span className="lk" style={{ background: 'var(--viz-air)' }} />
          Air around it
        </span>
        {stage.phases.some((p) => p.location === 'room') && (
          <span>
            <span className="sw" style={{ background: 'var(--viz-warm-wash)', border: '1px solid var(--border)' }} />
            Room
          </span>
        )}
        {stage.phases.some((p) => p.location === 'fridge') && (
          <span>
            <span className="sw" style={{ background: 'var(--viz-cold-wash)', border: '1px solid var(--border)' }} />
            Fridge
          </span>
        )}
        {stage.phases.some((p) => p.location === 'custom') && (
          <span>
            <span className="sw" style={{ background: 'var(--viz-custom-wash)', border: '1px solid var(--border)' }} />
            Set temperature
          </span>
        )}
      </div>
      <div className="tchart" ref={wrapRef}>
        <svg
          ref={ref}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${stage.title}: dough temperature from ${formatTemp(pts[0].doughC, u, 0)} to ${formatTemp(pts[pts.length - 1].doughC, u, 0)}. Use arrow keys to read values.`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {bands.map((b, i) => (
            <rect
              key={i}
              className={`band-${b.loc}`}
              x={x(b.from)}
              y={PAD.t}
              width={Math.max(0, x(b.to) - x(b.from))}
              height={H - PAD.t - PAD.b}
            />
          ))}
          <g className="grid">
            {model.yTicks.map((v) => (
              <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            ))}
          </g>
          <g className="axis">
            {model.yTicks.map((v) => (
              <text key={v} x={PAD.l - 6} y={y(v) + 4} textAnchor="end">
                {v}°
              </text>
            ))}
            {model.xTicks.map((tk, i) => (
              <text key={i} x={Math.min(W - PAD.r - 2, Math.max(PAD.l + 2, x(tk.t)))} y={H - 8} textAnchor="middle">
                {tk.label}
              </text>
            ))}
          </g>
          <path className="line-air" d={model.air} />
          <path className="line-dough" d={model.dough} />
          {nowT !== null && nowT > model.t0 && nowT < model.t1 && (
            <line className="now-line" x1={x(nowT)} x2={x(nowT)} y1={PAD.t} y2={H - PAD.b} />
          )}
          <circle
            className="dot"
            r={4}
            cx={x(pts[pts.length - 1].t)}
            cy={y(conv(pts[pts.length - 1].doughC))}
            fill="var(--viz-dough)"
          />
          {hp && (
            <g>
              <line className="cross" x1={x(hp.t)} x2={x(hp.t)} y1={PAD.t} y2={H - PAD.b} />
              <circle className="dot" r={4.5} cx={x(hp.t)} cy={y(conv(hp.envC))} fill="var(--viz-air)" />
              <circle className="dot" r={4.5} cx={x(hp.t)} cy={y(conv(hp.doughC))} fill="var(--viz-dough)" />
            </g>
          )}
        </svg>
        {hp && (
          <div className="tip" style={{ left: Math.min(W - 72, Math.max(72, x(hp.t))) }}>
            <div className="faint">
              {formatDay(atTime(bake, hp.t))} {formatClock(atTime(bake, hp.t), timeFormat)} · {phaseAt(hp.t) === 'fridge' ? 'fridge' : phaseAt(hp.t) === 'room' ? 'room' : 'set temp'}
            </div>
            <div>
              <span className="tk" style={{ background: 'var(--viz-dough)' }} />
              <span className="tv">{formatTemp(hp.doughC, u)}</span> <span className="muted">dough</span>
            </div>
            <div>
              <span className="tk" style={{ background: 'var(--viz-air)' }} />
              <span className="tv">{formatTemp(hp.envC, u)}</span> <span className="muted">air</span>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <Details summary="Temperature table">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Dough</th>
                  <th>Air</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((p, i) => {
                  const d = atTime(bake, p.t)
                  return (
                    <tr key={i}>
                      <td>
                        {formatDay(d)} {formatClock(d, timeFormat)}
                      </td>
                      <td>{formatTemp(p.doughC, u)}</td>
                      <td>{formatTemp(p.envC, u)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Details>
      </div>
    </div>
  )
}
