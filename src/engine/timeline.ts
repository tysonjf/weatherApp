import type { Phase, PhaseLocation, Recipe, TimelineEvent } from './types'
import { locationLabel, totalHours } from './phases'
import { ovenById, prefermentPreset } from './presets'

export interface TimelineInput {
  recipe: Recipe
  /** Environment temperature of a phase at a moment (hours relative to the bake). */
  tempOf: (p: Phase, atH: number) => number
  finalMixH: number
  preheatMin: number
  bakeLabel: string
  /** Hours before its build that a sourdough seed should be fed (0 = none). */
  feedLeadH: Record<string, number>
  directFeedLeadH: number
  waterNotes: Record<string, string>
}

const place = (loc: PhaseLocation, t: number, unit: (c: number) => string) =>
  loc === 'fridge' ? `in the fridge (${unit(t)})` : loc === 'room' ? `at room temperature (${unit(t)})` : `at ${unit(t)}`

/**
 * Builds the dough forecast: every action from the first preferment to the bake,
 * in hours relative to the bake time (negative = before).
 */
export function buildTimeline(input: TimelineInput, unit: (c: number) => string): TimelineEvent[] {
  const { recipe: r, tempOf } = input
  const events: TimelineEvent[] = []
  const finalPhases = r.final.phases.filter((p) => p.hours > 0)
  const finalH = totalHours(finalPhases)
  const mixH = input.finalMixH
  const finalStart = -(finalH + mixH)

  // Preferments, each ending exactly at the final mix.
  if (r.method === 'indirect') {
    for (const pf of r.preferments) {
      const preset = prefermentPreset(pf.type)
      const phases = pf.phases.filter((p) => p.hours > 0)
      const dur = totalHours(phases)
      let t = finalStart - dur
      const feedLead = input.feedLeadH[pf.id] ?? 0
      if (pf.leavening === 'sourdough' && feedLead > 0) {
        events.push({
          id: `${pf.id}-feed`,
          kind: 'feed',
          atH: t - feedLead,
          durationMin: 5,
          title: 'Feed your starter',
          detail: `Refresh the mother starter so it peaks when you build the ${pf.name.toLowerCase()} (1 : 1 : 1 at room temperature).`,
          stageId: pf.id,
        })
      }
      events.push({
        id: `${pf.id}-build`,
        kind: 'build',
        atH: t,
        durationMin: 10,
        title: `Mix the ${pf.name.toLowerCase()}`,
        detail: `${input.waterNotes[pf.id] ?? ''} Then leave it ${place(phases[0]?.location ?? 'room', tempOf(phases[0] ?? pf.phases[0], t), unit)}.`.trim(),
        stageId: pf.id,
        tempC: phases[0] ? tempOf(phases[0], t) : undefined,
        location: phases[0]?.location,
      })
      phases.forEach((p, i) => {
        if (i > 0 && p.location !== phases[i - 1].location) {
          events.push({
            id: `${pf.id}-move-${i}`,
            kind: 'move',
            atH: t,
            durationMin: 2,
            title: p.location === 'fridge' ? `${preset.name} into the fridge` : `${preset.name} out: ${locationLabel(p.location).toLowerCase()}`,
            detail: `Move it ${place(p.location, tempOf(p, t), unit)} for ${fmtH(p.hours)}.`,
            stageId: pf.id,
            tempC: tempOf(p, t),
            location: p.location,
          })
        }
        t += p.hours
      })
    }
  }

  if (r.method === 'direct' && r.directLeavening === 'sourdough' && input.directFeedLeadH > 0) {
    events.push({
      id: 'starter-feed',
      kind: 'feed',
      atH: finalStart - input.directFeedLeadH,
      durationMin: 5,
      title: 'Feed your starter',
      detail: 'Refresh it so it is at peak (domed, bubbly, doubled) when you mix the dough.',
      stageId: 'final',
    })
  }

  const autolyseH = Math.max(0, r.final.autolyseMin ?? 0) / 60
  if (autolyseH > 0)
    events.push({
      id: 'autolyse',
      kind: 'autolyse',
      atH: finalStart - autolyseH,
      durationMin: 10,
      title: 'Autolyse: flour + water',
      detail: `Mix the ${r.method === 'indirect' ? 'final-dough ' : ''}flour with the water (hold back ~5 % to add later) until no dry bits remain. Cover and rest ${Math.round(autolyseH * 60)} min; salt, yeast${r.method === 'indirect' ? ' and the preferments' : ''} go in when you mix.`,
      stageId: 'final',
    })

  events.push({
    id: 'final-mix',
    kind: 'mix',
    atH: finalStart,
    durationMin: Math.round(mixH * 60),
    title: r.method === 'indirect' ? 'Mix the final dough' : 'Mix the dough',
    detail: input.waterNotes.final ?? '',
    stageId: 'final',
  })

  // Stretch-and-folds early in the bulk (only while the dough is still in one piece).
  const folds = Math.max(0, Math.round(r.final.folds ?? 0))
  const every = Math.max(10, r.final.foldEveryMin ?? 30) / 60
  const firstBulk = finalPhases[0] && (finalPhases[0].stage ?? 'bulk') === 'bulk' ? finalPhases[0] : null
  if (firstBulk)
    for (let k = 1; k <= folds && k * every < firstBulk.hours - 0.05; k++)
      events.push({
        id: `fold-${k}`,
        kind: 'fold',
        atH: finalStart + mixH + k * every,
        durationMin: 2,
        title: `Stretch & fold ${k} of ${folds}`,
        detail: 'Wet your hands, lift one side of the dough and fold it over; turn the bowl and repeat all round (coil folds for very wet dough). Cover again.',
        stageId: 'final',
      })

  let t = finalStart + mixH
  let balled = false
  finalPhases.forEach((p, i) => {
    const prev = finalPhases[i - 1]
    const stage = p.stage ?? 'bulk'
    if (stage === 'balls' && !balled) {
      balled = true
      events.push({
        id: `ball-${i}`,
        kind: 'ball',
        atH: t,
        durationMin: 15,
        title: r.sizing.mode === 'pans' ? 'Divide & pan' : 'Divide & ball',
        detail:
          r.sizing.mode === 'pans'
            ? `Divide into ${r.sizing.count} and place in oiled pans, then ${place(p.location, tempOf(p, t), unit)}.`
            : `Divide into ${r.sizing.count} balls and shape tightly, then ${place(p.location, tempOf(p, t), unit)}.`,
        stageId: 'final',
        tempC: tempOf(p, t),
        location: p.location,
      })
    } else if (prev && p.location !== prev.location) {
      const out = prev.location === 'fridge'
      events.push({
        id: `final-move-${i}`,
        kind: out ? 'temper' : 'move',
        atH: t,
        durationMin: 2,
        title: out
          ? `${balled ? 'Balls' : 'Dough'} out of the fridge`
          : p.location === 'fridge'
            ? `${balled ? 'Balls' : 'Dough'} into the fridge`
            : `Move the ${balled ? 'balls' : 'dough'}`,
        detail: `Keep ${place(p.location, tempOf(p, t), unit)} for ${fmtH(p.hours)}.`,
        stageId: 'final',
        tempC: tempOf(p, t),
        location: p.location,
      })
    }
    t += p.hours
  })
  if (!balled) {
    // No ball phase: divide right before baking.
    events.push({
      id: 'ball-end',
      kind: 'ball',
      atH: -0.25,
      durationMin: 15,
      title: 'Divide & shape',
      detail: 'Divide and shape just before baking.',
      stageId: 'final',
    })
  }

  const oven = ovenById(r.ovenId)
  events.push({
    id: 'preheat',
    kind: 'preheat',
    atH: -input.preheatMin / 60,
    durationMin: input.preheatMin,
    title: `Preheat the ${oven.name.toLowerCase()}`,
    detail: `${oven.blurb} Target ${unit(oven.tempC[0])}–${unit(oven.tempC[1])}.`,
    stageId: 'final',
  })
  events.push({
    id: 'bake',
    kind: 'bake',
    atH: 0,
    durationMin: 30,
    title: 'Bake!',
    detail: input.bakeLabel,
    stageId: 'final',
  })

  const order: Record<TimelineEvent['kind'], number> = {
    feed: 0,
    build: 1,
    move: 2,
    autolyse: 2.5,
    mix: 3,
    fold: 3.5,
    ball: 4,
    temper: 5,
    preheat: 6,
    bake: 7,
  }
  return events.sort((a, b) => a.atH - b.atH || order[a.kind] - order[b.kind])
}

function fmtH(h: number): string {
  const m = Math.round(h * 60)
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return hh && mm ? `${hh} h ${mm} min` : hh ? `${hh} h` : `${mm} min`
}
