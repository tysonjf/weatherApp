import { describe, expect, it } from 'vitest'
import { cToF, formatHours, formatPct, formatTemp, formatWeight, fToC, gToOz, localizeTemps, roundTo } from './units'
import { buildIcs } from '../lib/ics'
import { roomTempAt } from './ambient'

describe('units', () => {
  it('rewrites static °C copy for °F readers', () => {
    expect(localizeTemps('Mix to 18–20 °C, then 4 °C fridge', 'C')).toBe('Mix to 18–20 °C, then 4 °C fridge')
    expect(localizeTemps('Mix to 18–20 °C, then 4 °C fridge', 'F')).toBe('Mix to 64–68 °F, then 39 °F fridge')
    // Oven temperatures round to 5 °F.
    expect(localizeTemps('Floor 430 °C+, dome ~485 °C.', 'F')).toBe('Floor 805 °F+, dome ~905 °F.')
    expect(localizeTemps('No temperatures here', 'F')).toBe('No temperatures here')
  })

  it('models a daily room-temperature cycle', () => {
    const at = (h: number) => new Date(2026, 0, 10, h, 0).getTime()
    expect(roomTempAt(at(16), 24, 18)).toBeCloseTo(24, 6)
    expect(roomTempAt(at(4), 24, 18)).toBeCloseTo(18, 6)
    expect(roomTempAt(at(10), 24, 18)).toBeCloseTo(21, 6)
    expect(roomTempAt(at(4), 24, null)).toBe(24)
  })

  it('converts temperatures both ways', () => {
    expect(cToF(0)).toBe(32)
    expect(cToF(100)).toBe(212)
    expect(fToC(212)).toBeCloseTo(100)
    expect(fToC(cToF(23.4))).toBeCloseTo(23.4)
  })

  it('rounds without floating point dust', () => {
    expect(roundTo(0.1 + 0.2, 0.01)).toBe(0.3)
    expect(roundTo(123.456, 0.5)).toBe(123.5)
  })

  it('formats weights with kitchen precision', () => {
    expect(formatWeight(1234.4)).toBe('1234 g')
    expect(formatWeight(27.26)).toBe('27.5 g')
    expect(formatWeight(3.14159)).toBe('3.1 g')
    expect(formatWeight(0.456)).toBe('0.46 g')
    expect(formatWeight(28.349523125, 'oz')).toBe('1 oz')
    expect(gToOz(453.59237)).toBeCloseTo(16)
  })

  it('formats temperatures, percentages and durations', () => {
    expect(formatTemp(23.5)).toBe('23.5°C')
    expect(formatTemp(20, 'F')).toBe('68°F')
    expect(formatPct(65)).toBe('65%')
    expect(formatPct(0.052)).toBe('0.052%')
    expect(formatHours(1.5)).toBe('1h 30m')
    expect(formatHours(49)).toBe('2d 1h')
    expect(formatHours(0.25)).toBe('15m')
  })
})

describe('ics export', () => {
  it('builds a valid calendar with folded lines and alarms', () => {
    const ics = buildIcs('Pizza', [
      {
        uid: 'a',
        title: 'Mix biga, then rest',
        description: 'Use 18°C water; mix only until shaggy. '.repeat(4),
        start: new Date(Date.UTC(2026, 8, 25, 17, 0)),
        durationMin: 15,
      },
    ])
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20260925T170000Z')
    expect(ics).toContain('DTEND:20260925T171500Z')
    expect(ics).toContain('SUMMARY:Mix biga\\, then rest')
    expect(ics).toContain('BEGIN:VALARM')
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})
