import { describe, expect, it } from 'vitest'
import { C_FLOUR, C_SALT, classicWaterTemp, doughTempFor, mixCp, solveWater, type ThermalMass } from './temperature'

const flour = (g: number, t: number): ThermalMass => ({ label: 'flour', massG: g, cp: C_FLOUR, tempC: t })

describe('water temperature heat balance', () => {
  it('matches the worked Neapolitan example (1000 g flour, 650 g water, 24 °C room, spiral)', () => {
    const r = solveWater({
      masses: [flour(1000, 24), { label: 'salt', massG: 28, cp: C_SALT, tempC: 24 }],
      waterG: 650,
      newFlourG: 1000,
      targetC: 24,
      mixerRiseC: 3.5,
      tapC: 10,
    })
    expect(r.status).toBe('ok')
    expect(r.idealWaterC).toBeGreaterThan(12)
    expect(r.idealWaterC).toBeLessThan(13.2)
    expect(r.expectedC).toBeCloseTo(24)
  })

  it('needs much warmer water for a biga straight from the fridge', () => {
    const base = {
      waterG: 425,
      newFlourG: 500,
      targetC: 24,
      mixerRiseC: 4,
      tapC: 10,
    }
    const cold = solveWater({
      ...base,
      masses: [flour(500, 22), { label: 'biga', massG: 725, cp: mixCp(500, 225), tempC: 4 }],
    })
    const warm = solveWater({
      ...base,
      masses: [flour(500, 22), { label: 'biga', massG: 725, cp: mixCp(500, 225), tempC: 18 }],
    })
    expect(cold.idealWaterC).toBeGreaterThan(29)
    expect(cold.idealWaterC).toBeLessThan(34)
    expect(warm.idealWaterC).toBeGreaterThan(15)
    expect(warm.idealWaterC).toBeLessThan(19)
  })

  it('switches to ice and reproduces the textbook (tap − need)/(tap + 80) split', () => {
    const r = solveWater({
      masses: [flour(1000, 30)],
      waterG: 650,
      newFlourG: 1000,
      targetC: 24,
      mixerRiseC: 3.5,
      tapC: 22,
    })
    expect(r.status).toBe('ice')
    const textbook = (650 * (22 - r.idealWaterC)) / (22 + 333.6 / 4.186)
    expect(r.iceG).toBeCloseTo(textbook, 1)
    expect(r.liquidG + r.iceG).toBeCloseTo(650)
    expect(doughTempFor({ masses: [flour(1000, 30)], waterG: 650, newFlourG: 1000, mixerRiseC: 3.5 }, 22, r.iceG)).toBeCloseTo(24)
  })

  it('caps ice and suggests chilling the flour when even ice is not enough', () => {
    const r = solveWater({
      masses: [flour(1000, 38)],
      waterG: 600,
      newFlourG: 1000,
      targetC: 17,
      mixerRiseC: 5,
      tapC: 28,
    })
    expect(r.status).toBe('too-cold')
    expect(r.iceG).toBeCloseTo(600 * 0.35)
    expect(r.expectedC).toBeGreaterThan(17)
    expect(r.flourNeededC).toBeLessThan(38)
  })

  it('caps hot water and reports the achievable temperature', () => {
    const r = solveWater({
      masses: [flour(0, 20), { label: 'biga', massG: 1450, cp: mixCp(1000, 450), tempC: 4 }],
      waterG: 200,
      newFlourG: 0,
      targetC: 24,
      mixerRiseC: 3,
      tapC: 10,
    })
    expect(r.status).toBe('too-hot')
    expect(r.waterC).toBe(35)
    expect(r.expectedC).toBeLessThan(24)
  })

  it('implements the classic DDT rule', () => {
    // DDT 24.4, room 22.2, flour 21.1, FF 13.3 → 16.7 °C (King Arthur's 62 °F example)
    expect(classicWaterTemp({ targetC: 24.44, flourC: 21.11, roomC: 22.22, frictionFactorC: 13.33, prefermentTempsC: [] })).toBeCloseTo(16.66, 1)
  })
})
