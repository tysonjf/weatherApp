import { useEffect, useRef, useState } from 'react'
import { atTime } from '../state/hooks'
import { formatClock } from '../lib/time'
import type { TimeFormat } from '../state/settings'

export const CHART_PAD = { l: 34, r: 12, t: 10, b: 26 }

/** Width of an element in CSS pixels, so SVG text renders at its true size on every screen. */
export function useWidth(fallback = 340) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Clock-aligned time ticks (hours relative to the bake), about one label every 70 px. */
export function timeTicks(bake: Date, t0: number, t1: number, width: number, timeFormat: TimeFormat) {
  const span = t1 - t0
  const perLabel = (span * 70) / Math.max(200, width - CHART_PAD.l - CHART_PAD.r)
  const every = [1, 2, 3, 4, 6, 8, 12, 24, 48].find((e) => e >= perLabel) ?? 48
  const start = atTime(bake, t0)
  const firstTick = new Date(start)
  firstTick.setMinutes(0, 0, 0)
  while (firstTick.getHours() % every !== 0 || firstTick < start) firstTick.setHours(firstTick.getHours() + 1)
  const ticks: { t: number; label: string }[] = []
  let lastDay = ''
  const weekday = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' })
  for (let d = new Date(firstTick); d.getTime() <= atTime(bake, t1).getTime(); d.setHours(d.getHours() + every)) {
    const t = (d.getTime() - bake.getTime()) / 3600000
    const day = weekday(d)
    const label = every >= 24 ? day : day !== lastDay ? `${day} ${formatClock(d, timeFormat)}` : formatClock(d, timeFormat)
    lastDay = day
    ticks.push({ t, label })
  }
  return ticks
}

/** Index of the point closest in time to a pointer x position. */
export function nearestIndex<T extends { t: number }>(pts: T[], t: number): number {
  let best = 0
  for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i
  return best
}
