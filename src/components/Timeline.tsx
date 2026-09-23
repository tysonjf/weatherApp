import type { TimelineEvent } from '../engine/types'
import { formatHours, formatTemp } from '../engine/units'
import { clashes } from '../engine/schedule'
import { atTime, useDayPlan } from '../state/hooks'
import { formatDayClock } from '../lib/time'
import { useSettings } from '../state/store'
import { Icon, type IconName } from './Icon'

const KIND: Record<TimelineEvent['kind'], { icon: IconName; tone: string }> = {
  feed: { icon: 'drop', tone: '' },
  build: { icon: 'bowl', tone: 'warm' },
  move: { icon: 'snow', tone: 'cold' },
  mix: { icon: 'bowl', tone: 'primary' },
  ball: { icon: 'hand', tone: 'warm' },
  temper: { icon: 'sun', tone: 'warm' },
  preheat: { icon: 'flame', tone: 'hot' },
  bake: { icon: 'pizza', tone: 'primary' },
}

export function Timeline({ events, bake, now }: { events: TimelineEvent[]; bake: Date; now: Date }) {
  const { timeFormat, tempUnit } = useSettings()
  const plan = useDayPlan()
  const clash = new Map(clashes(events, bake.getTime(), plan).map((c) => [c.event.id, c.block.kind]))
  const nowH = (now.getTime() - bake.getTime()) / 3600000
  const nextIdx = events.findIndex((e) => e.atH >= nowH)

  return (
    <ol className="timeline">
      {events.map((e, i) => {
        const at = atTime(bake, e.atH)
        const k = KIND[e.kind]
        const tone = e.kind === 'move' && e.location !== 'fridge' ? 'warm' : k.tone
        const icon: IconName = e.kind === 'move' && e.location !== 'fridge' ? 'sun' : k.icon
        const past = e.atH < nowH - 0.05
        const isNext = i === nextIdx
        const inH = e.atH - nowH
        return (
          <li key={e.id} className={`${past ? 'past' : ''} ${isNext ? 'now' : ''}`}>
            <span className={`t-dot ${tone}`}>
              <Icon name={icon} size={20} />
            </span>
            <div>
              <div className="t-when">
                {formatDayClock(at, timeFormat)}
                {isNext && inH > 0 && <span style={{ color: 'var(--primary)' }}> · in {formatHours(inH)}</span>}
                {e.tempC !== undefined && <> · {formatTemp(e.tempC, tempUnit, 0)}</>}
                {clash.has(e.id) && !past && (
                  <span className={`badge ${clash.get(e.id) === 'sleep' ? 'cold' : 'warm'}`} style={{ marginLeft: 6 }}>
                    {clash.get(e.id) === 'sleep' ? '😴 while you sleep' : '💼 while you work'}
                  </span>
                )}
              </div>
              <div className="t-title">{e.title}</div>
              {e.detail && <div className="t-detail">{e.detail}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
