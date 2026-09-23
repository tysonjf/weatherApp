/**
 * Preset data integrity: every style, oven, flour, schedule, preferment and mixer is internally
 * consistent and everything it refers to exists.
 */
import { describe, expect, it } from 'vitest'
import { FLOURS, OVENS, PREFERMENTS, SCHEDULES, STYLES, blendOf, flourById } from './presets'
import { MIXERS } from './mixers'
import { DOUGH_PER_ADULT, OVEN_SERVICE, TOPPING_PROFILES } from './party'
import { GUIDES } from '../content/guides'

const unique = (ids: string[]) => new Set(ids).size === ids.length

describe('preset data', () => {
  it('ids are unique', () => {
    expect(unique(STYLES.map((s) => s.id))).toBe(true)
    expect(unique(OVENS.map((o) => o.id))).toBe(true)
    expect(unique(FLOURS.map((f) => f.id))).toBe(true)
    expect(unique(PREFERMENTS.map((p) => p.type))).toBe(true)
    expect(unique(SCHEDULES.map((s) => s.id))).toBe(true)
    expect(unique(MIXERS.map((m) => m.id))).toBe(true)
    expect(unique(GUIDES.map((g) => g.id))).toBe(true)
  })

  for (const st of STYLES)
    it(`style ${st.id} is consistent`, () => {
      expect(OVENS.some((o) => o.id === st.ovenId), 'oven exists').toBe(true)
      expect(FLOURS.some((f) => f.id === st.flourId), 'flour exists').toBe(true)
      expect(SCHEDULES.some((s) => s.id === st.scheduleId), 'schedule exists').toBe(true)
      for (const p of st.preferments ?? []) expect(PREFERMENTS.some((x) => x.type === p.type), 'preferment exists').toBe(true)
      expect(st.hydration, 'hydration in its range').toBeGreaterThanOrEqual(st.hydrationRange[0])
      expect(st.hydration).toBeLessThanOrEqual(st.hydrationRange[1])
      expect(st.hydrationRange[0]).toBeLessThan(st.hydrationRange[1])
      expect(st.saltPct).toBeGreaterThanOrEqual(0)
      expect(st.saltPct).toBeLessThanOrEqual(4)
      expect(st.oilPct).toBeGreaterThanOrEqual(0)
      expect(st.oilPct).toBeLessThanOrEqual(25)
      expect(st.sugarPct).toBeLessThanOrEqual(8)
      expect(st.maltPct).toBeLessThanOrEqual(3)
      expect(st.targetFdtC, 'final dough temperature').toBeGreaterThanOrEqual(18)
      expect(st.targetFdtC).toBeLessThanOrEqual(30)
      expect(st.proofTarget).toBeGreaterThanOrEqual(0.5)
      expect(st.proofTarget).toBeLessThanOrEqual(2)
      expect(st.wastePct).toBeGreaterThanOrEqual(0)
      // Sheeted-and-trimmed styles (tavern) lose more to trimmings.
      expect(st.wastePct).toBeLessThanOrEqual(15)
      expect(st.reservePct).toBeGreaterThanOrEqual(0)
      expect(st.folds ?? 0).toBeGreaterThanOrEqual(0)
      if (st.sizing.mode === 'balls') {
        expect(st.ballRange, 'ball range').toBeDefined()
        expect(st.sizing.ballWeight!).toBeGreaterThanOrEqual(st.ballRange![0])
        expect(st.sizing.ballWeight!).toBeLessThanOrEqual(st.ballRange![1])
      } else {
        expect(st.tfRange, 'dough-per-area range').toBeDefined()
        expect(st.sizing.thicknessFactor!).toBeGreaterThanOrEqual(st.tfRange![0])
        expect(st.sizing.thicknessFactor!).toBeLessThanOrEqual(st.tfRange![1])
      }
      expect(st.bake.length).toBeGreaterThan(0)
      expect(st.shaping.length).toBeGreaterThan(0)
      // Pizza night knows how to top and portion it.
      expect(TOPPING_PROFILES[st.id], 'topping profile').toBeDefined()
      expect(DOUGH_PER_ADULT[st.id], 'portion').toBeGreaterThan(0)
      // Neapolitan-family styles contain no sugar or oil (burns above 400 °C).
      const oven = OVENS.find((o) => o.id === st.ovenId)!
      if (oven.tempC[0] >= 400) {
        expect(st.sugarPct, 'no sugar in a 400 °C+ oven').toBe(0)
        expect(st.oilPct, 'no oil in a 400 °C+ oven').toBeLessThanOrEqual(1)
      }
    })

  it('ovens have sensible temperatures and a service pace', () => {
    for (const o of OVENS) {
      expect(o.tempC[0]).toBeLessThanOrEqual(o.tempC[1])
      expect(o.preheatMin).toBeGreaterThan(0)
      const svc = OVEN_SERVICE[o.id]
      expect(svc, o.id).toBeDefined()
      expect(svc.cadenceMin * 60).toBeGreaterThanOrEqual(svc.bakeSec)
      expect(svc.capacity).toBeGreaterThanOrEqual(1)
    }
  })

  it('flours have ordered, plausible W and protein', () => {
    for (const f of FLOURS) {
      expect(f.w[0], f.id).toBeLessThanOrEqual(f.w[1])
      expect(f.w[0]).toBeGreaterThanOrEqual(150)
      expect(f.w[1]).toBeLessThanOrEqual(450)
      expect(f.proteinPct).toBeGreaterThanOrEqual(8)
      expect(f.proteinPct).toBeLessThanOrEqual(16)
      expect(f.note.length).toBeGreaterThan(0)
    }
    // Stronger flours carry more protein, broadly: W and protein rank together.
    const strong = flourById('caputo-manitoba')
    const weak = flourById('caputo-classica')
    expect(strong.w[0]).toBeGreaterThan(weak.w[1])
    expect(strong.proteinPct).toBeGreaterThan(weak.proteinPct)
  })

  it('blends weight W and protein by share', () => {
    const b = blendOf({ flourId: 'caputo-pizzeria', flour2Id: 'wholemeal', flour2Pct: 25 })
    const a = flourById('caputo-pizzeria')
    const w = flourById('wholemeal')
    expect(b.proteinPct).toBeCloseTo(a.proteinPct * 0.75 + w.proteinPct * 0.25, 9)
    expect(b.w[0]).toBe(Math.round(a.w[0] * 0.75 + w.w[0] * 0.25))
    expect(b.wholePct).toBeCloseTo(25, 9)
    const single = blendOf({ flourId: 'caputo-pizzeria' })
    expect(single.w).toEqual(a.w)
    expect(single.wholePct).toBe(0)
  })

  it('schedules start with bulk, keep bulk before balls and never end in the fridge', () => {
    for (const s of SCHEDULES) {
      expect(s.phases.length, s.id).toBeGreaterThan(0)
      for (const p of s.phases) expect(p.hours, s.id).toBeGreaterThan(0)
      expect(s.phases[0].stage, s.id).toBe('bulk')
      const firstBall = s.phases.findIndex((p) => p.stage === 'balls')
      if (firstBall >= 0) for (const p of s.phases.slice(firstBall)) expect(p.stage, s.id).toBe('balls')
      expect(s.phases.at(-1)!.location, s.id).not.toBe('fridge')
    }
  })

  it('preferments are within their own ranges', () => {
    for (const p of PREFERMENTS) {
      expect(p.hydration, p.type).toBeGreaterThanOrEqual(p.hydrationRange[0])
      expect(p.hydration, p.type).toBeLessThanOrEqual(p.hydrationRange[1])
      expect(p.flourPct).toBeGreaterThan(0)
      expect(p.flourPct).toBeLessThanOrEqual(100)
      for (const ph of p.schedule) expect(ph.hours).toBeGreaterThan(0)
      if (p.leavening === 'yeast') expect(p.carryFreshPct, p.type).toBeGreaterThan(0)
    }
  })

  it('mixers: typical heat within their range', () => {
    for (const m of MIXERS) {
      expect(m.range[0], m.id).toBeLessThanOrEqual(m.range[1])
      expect(m.riseC, m.id).toBeGreaterThanOrEqual(m.range[0])
      expect(m.riseC, m.id).toBeLessThanOrEqual(m.range[1])
      expect(m.mixMinutes).toBeGreaterThan(0)
    }
  })
})
