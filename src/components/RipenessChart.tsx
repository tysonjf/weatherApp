import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { CurvePoint, StageResult } from '../engine/types'
import { BAKE_WINDOW } from '../engine/fermentation'
import { formatTemp } from '../engine/units'
import { atTime } from '../state/hooks'
import { formatClock, formatDay } from '../lib/time'
import { useSettings } from '../state/store'
import { Details } from './ui'
import { CHART_PAD as PAD, nearestIndex, timeTicks, useWidth } from './chartKit'

const H = 190
const pct = (r: number) => `${Math.round(r * 100)} %`

/**
 * How ripe a stage is over time (100 % = the planned end point). For the final dough it also shows
 * the bake window and, dashed, what happens if the pizzas wait.
 */
export function RipenessChart({ stage, after, bake, now }: { stage: StageResult; after?: CurvePoint[]; bake: Date; now?: Date }) {
  const { timeFormat, tempUnit } = useSettings()
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const [wrapRef, W] = useWidth()
  const isFinal = stage.kind === 'final'
  // Show the wait-and-see tail until the dough is clearly past its best (or 4 h, whichever is first).
  const tail = useMemo(() => {
    if (!isFinal || !after?.length) return []
    const stop = after.findIndex((p) => p.ripeness > BAKE_WINDOW.max + 0.15 || p.t > 4)
    return after.slice(0, stop < 0 ? after.length : stop + 1)
  }, [after, isFinal])
  const pts = stage.curve
  const all = useMemo(() => [...pts, ...tail.slice(1)], [pts, tail])

  const model = useMemo(() => {
    if (all.length < 2) return null
    const t0 = all[0].t
    const t1 = all[all.length - 1].t
    const top = Math.max(1.5, Math.ceil((Math.max(...all.map((p) => p.ripeness)) + 0.05) * 4) / 4)
    const x = (t: number) => PAD.l + ((t - t0) / Math.max(0.01, t1 - t0)) * (W - PAD.l - PAD.r)
    const y = (r: number) => PAD.t + (1 - r / top) * (H - PAD.t - PAD.b)
    const yTicks: number[] = []
    for (let v = 0; v <= top + 1e-6; v += top > 2 ? 0.5 : 0.25) yTicks.push(v)
    const line = (ps: CurvePoint[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.ripeness).toFixed(1)}`).join('')
    return { t0, t1, top, x, y, yTicks, xTicks: timeTicks(bake, t0, t1, W, timeFormat), main: line(pts), tail: line(tail) }
  }, [all, pts, tail, bake, W, timeFormat])

  if (!model) return null
  const { x, y } = model
  const pick = (clientX: number) => {
    const svg = ref.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    return nearestIndex(all, model.t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (model.t1 - model.t0))
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => setHover(pick(e.clientX))
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setHover(Math.max(0, Math.min(all.length - 1, (hover ?? 0) + (e.key === 'ArrowRight' ? 2 : -2))))
  }
  const hp = hover !== null ? all[hover] : null
  const nowT = now ? (now.getTime() - bake.getTime()) / 3600000 : null
  const endLabel = isFinal ? 'bake' : 'mix'
  const endX = x(isFinal ? 0 : pts[pts.length - 1].t)
  const bandTop = y(Math.min(model.top, BAKE_WINDOW.max))
  const bandBottom = y(BAKE_WINDOW.min)
  const tableStep = Math.max(1, Math.round((model.t1 - model.t0) / 12))
  const tableRows = all.filter((p, i) => i === 0 || i === all.length - 1 || Math.abs((p.t - model.t0) % tableStep) < 0.13)

  return (
    <div>
      <div className="tchart" ref={wrapRef}>
        <svg
          ref={ref}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${stage.title}: ripeness reaches ${pct(stage.ripeness)} at the ${endLabel}. Use arrow keys to read values.`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {isFinal && (
            <g>
              <rect className="band-window" x={PAD.l} y={bandTop} width={W - PAD.l - PAD.r} height={Math.max(0, bandBottom - bandTop)} />
              <text className="band-label" x={PAD.l + 4} y={bandTop + 12}>
                bake window
              </text>
            </g>
          )}
          <g className="grid">
            {model.yTicks.map((v) => (
              <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            ))}
          </g>
          <line className="ref-line" x1={PAD.l} x2={W - PAD.r} y1={y(1)} y2={y(1)} />
          <g className="axis">
            {model.yTicks.map((v) => (
              <text key={v} x={PAD.l - 6} y={y(v) + 4} textAnchor="end">
                {Math.round(v * 100)}
              </text>
            ))}
            {model.xTicks.map((tk, i) => (
              <text key={i} x={Math.min(W - PAD.r - 2, Math.max(PAD.l + 2, x(tk.t)))} y={H - 8} textAnchor="middle">
                {tk.label}
              </text>
            ))}
          </g>
          <line className="now-line" x1={endX} x2={endX} y1={PAD.t} y2={H - PAD.b} strokeDasharray="3 3" />
          <text className="band-label" x={endX - 4} y={PAD.t + 10} textAnchor="end">
            {endLabel}
          </text>
          <path className="line-dough" d={model.main} />
          {model.tail && <path className="line-dough" d={model.tail} strokeDasharray="5 4" opacity={0.8} />}
          {nowT !== null && nowT > model.t0 && nowT < model.t1 && (
            <g>
              <line className="now-line" x1={x(nowT)} x2={x(nowT)} y1={PAD.t} y2={H - PAD.b} />
              <text className="band-label" x={x(nowT) + 4} y={H - PAD.b - 6}>
                now
              </text>
            </g>
          )}
          <circle className="dot" r={4} cx={x(pts[pts.length - 1].t)} cy={y(pts[pts.length - 1].ripeness)} fill="var(--viz-dough)" />
          {hp && (
            <g>
              <line className="cross" x1={x(hp.t)} x2={x(hp.t)} y1={PAD.t} y2={H - PAD.b} />
              <circle className="dot" r={4.5} cx={x(hp.t)} cy={y(hp.ripeness)} fill="var(--viz-dough)" />
            </g>
          )}
        </svg>
        {hp && (
          <div className="tip" style={{ left: Math.min(W - 72, Math.max(72, x(hp.t))) }}>
            <div className="faint">
              {formatDay(atTime(bake, hp.t))} {formatClock(atTime(bake, hp.t), timeFormat)}
              {isFinal && hp.t > 0.01 ? ' · if it waits' : ''}
            </div>
            <div>
              <span className="tk" style={{ background: 'var(--viz-dough)' }} />
              <span className="tv">{pct(hp.ripeness)}</span> <span className="muted">ripe</span>
            </div>
            <div className="muted">dough at {formatTemp(hp.doughC, tempUnit)}</div>
          </div>
        )}
      </div>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        100 % is the planned end point{isFinal ? `; the shaded band (${Math.round(BAKE_WINDOW.min * 100)}–${Math.round(BAKE_WINDOW.max * 100)} %) bakes well, and the dashed line shows what happens if the pizzas wait.` : ' — when this preferment goes into the final dough.'}
      </p>
      <div style={{ marginTop: 10 }}>
        <Details summary="Ripeness table">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Ripeness</th>
                  <th>Dough</th>
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
                      <td>{pct(p.ripeness)}</td>
                      <td>{formatTemp(p.doughC, tempUnit)}</td>
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
