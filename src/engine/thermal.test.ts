import { describe, expect, it } from 'vitest'
import { hoursToReach, tauHours, temperatureCurve, walkThermal } from './thermal'

describe('thermal model', () => {
  it('scales the time constant with piece size', () => {
    expect(tauHours(250)).toBeCloseTo(2.0)
    expect(tauHours(2000)).toBeCloseTo(4.0)
    expect(tauHours(31.25)).toBeCloseTo(1.0)
  })

  it('cools a 250 g ball from 24 °C to 8 °C in a 4 °C fridge in about 3 h', () => {
    const h = hoursToReach(24, 8, 4, 250)
    expect(h).toBeGreaterThan(2.5)
    expect(h).toBeLessThan(3.5)
  })

  it('takes longer to chill a 2 kg bulk than a ball', () => {
    expect(hoursToReach(24, 8, 4, 2000)).toBeGreaterThan(2 * hoursToReach(24, 8, 4, 250) - 0.01)
  })

  it('integrates time exactly and approaches the environment', () => {
    let total = 0
    const end = walkThermal(
      [
        { envC: 22, hours: 2, pieceMassG: 1500 },
        { envC: 4, hours: 24, pieceMassG: 250 },
      ],
      24,
      (dt) => {
        total += dt
      },
    )
    expect(total).toBeCloseTo(26)
    expect(end).toBeLessThan(4.1)
    const curve = temperatureCurve([{ envC: 4, hours: 10, pieceMassG: 250 }], 24)
    expect(curve[0].doughC).toBe(24)
    expect(curve.at(-1)!.t).toBeCloseTo(10)
    for (let i = 1; i < curve.length; i++) expect(curve[i].doughC).toBeLessThan(curve[i - 1].doughC)
  })
})
