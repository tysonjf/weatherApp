import type { TimeFormat } from '../state/settings'

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(d: Date, fmt: TimeFormat = '24h'): string {
  const h = d.getHours()
  const m = d.getMinutes()
  if (fmt === '12h') {
    const hh = h % 12 === 0 ? 12 : h % 12
    return `${hh}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`
  }
  return `${pad(h)}:${pad(m)}`
}

const DAY_MS = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export function formatDay(d: Date, ref: Date = new Date()): string {
  const diff = Math.round((startOfDay(d) - startOfDay(ref)) / DAY_MS)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDayClock(d: Date, fmt: TimeFormat = '24h', ref: Date = new Date()): string {
  return `${formatDay(d, ref)} ${formatClock(d, fmt)}`
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(s: string): Date | null {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The next "dinner time" (default 19:00) that leaves at least `leadHours` from now. */
export function defaultBakeTime(leadHours: number, hour = 19, now = new Date()): Date {
  const earliest = now.getTime() + leadHours * 3600000
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0)
  while (d.getTime() < earliest) d.setDate(d.getDate() + 1)
  return d
}

/** Rounds a date up to the next 5 minutes. */
export function roundUp5(d: Date): Date {
  const ms = 5 * 60000
  return new Date(Math.ceil(d.getTime() / ms) * ms)
}
