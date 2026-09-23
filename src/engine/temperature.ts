/**
 * Water temperature & ice — a heat balance instead of the bakers' "multiply by 3" rule.
 *
 * T_dough = (Σ mᵢ·cᵢ·Tᵢ + q_hyd·m_newFlour) / Σ mᵢ·cᵢ  +  ΔT_mixer
 *
 *  - cᵢ: specific heat of each component — flour 1.80 kJ/kg·K (12–14 % moisture), water 4.186,
 *    salt 0.86, oil ≈ 2.0, sugar ≈ 1.25, preferments as their flour/water mix
 *    (biga 45 % ≈ 2.54, poolish ≈ 2.99).
 *  - q_hyd: heat released when dry flour is wetted, 15.1 kJ per kg of flour (6.5 BTU/lb). That is
 *    worth ≈ +3.3 °C in a 65 % straight dough and is the main thing the classic "friction factor"
 *    silently absorbs. Flour already hydrated inside a preferment releases no more.
 *  - ΔT_mixer: purely mechanical kneading heat, the only mixer-specific (and calibratable) term.
 *
 * Water carries ~60 % of a 65 % dough's heat capacity, so a 1 °C change in dough temperature needs
 * ~1.7 °C of water change — the classic averaging rule assumes 3 °C and over-corrects, especially
 * with cold preferments. Ice: melting absorbs L = 333.6 kJ/kg, which reproduces the textbook
 * ice = water·(T_tap − T_needed)/(T_tap + 80) exactly when the rest of the balance is fixed.
 */

export const C_WATER = 4.186 // kJ/(kg·K)
export const C_FLOUR = 1.8 // kJ/(kg·K), flour at 12–14 % moisture
export const C_SALT = 0.86
export const C_OIL = 2.0
export const C_SUGAR = 1.25
export const L_FUSION = 333.6 // kJ/kg
export const Q_HYDRATION = 15.1 // kJ per kg of newly wetted flour
/**
 * Warmest water we suggest by default. Pizza doughs are mixed with cool to tepid water; above ~30 °C
 * fresh yeast dissolved in it starts to suffer and a cold preferment meets hot water unevenly. When a
 * dough would need more, a cold preferment rests out of the fridge first and the mix runs longer
 * (see compute.ts). The cap is a setting.
 */
export const DEFAULT_MAX_WATER_C = 30
/** Keep ice to at most this share of the water so it melts and hydrates evenly. */
export const MAX_ICE_SHARE = 0.35

export interface ThermalMass {
  label: string
  massG: number
  /** kJ/(kg·K) */
  cp: number
  tempC: number
}

/** Specific heat of a flour/water mix (preferments, starter). */
export function mixCp(flourG: number, waterG: number): number {
  const m = flourG + waterG
  return m > 0 ? (flourG * C_FLOUR + waterG * C_WATER) / m : C_FLOUR
}

export interface WaterSolveInput {
  /** Everything except the water being solved for (flour, preferments, salt, oil…). */
  masses: ThermalMass[]
  waterG: number
  /** Dry flour wetted for the first time in this mix (releases hydration heat). */
  newFlourG: number
  targetC: number
  mixerRiseC: number
  /** Coldest liquid water available (tap / fridge) before switching to ice. */
  tapC: number
  /** Warmest water to suggest (default DEFAULT_MAX_WATER_C). */
  maxWaterC?: number
}

export interface WaterSolveResult {
  /** Water temperature that hits the target exactly (may be below 0 °C or far too hot). */
  idealWaterC: number
  /** Temperature of the liquid water to pour. */
  waterC: number
  iceG: number
  liquidG: number
  /** Dough temperature you will actually get. */
  expectedC: number
  status: 'ok' | 'ice' | 'too-cold' | 'too-hot'
  /** When 'too-cold': flour temperature that would still hit the target with the capped ice. */
  flourNeededC?: number
}

function heatSum(masses: ThermalMass[]) {
  let H = 0
  let C = 0
  for (const m of masses) {
    H += m.massG * m.cp * m.tempC
    C += m.massG * m.cp
  }
  return { H, C }
}

/** Dough temperature produced by the given liquid water temperature and ice (0 °C). */
export function doughTempFor(
  input: Pick<WaterSolveInput, 'masses' | 'waterG' | 'newFlourG' | 'mixerRiseC'>,
  waterC: number,
  iceG = 0,
): number {
  const { H, C } = heatSum(input.masses)
  const liquid = input.waterG - iceG
  const Htot = H + liquid * C_WATER * waterC - iceG * L_FUSION + input.newFlourG * Q_HYDRATION
  const Ctot = C + input.waterG * C_WATER
  return Ctot > 0 ? Htot / Ctot + input.mixerRiseC : waterC
}

export function solveWater(input: WaterSolveInput): WaterSolveResult {
  const { H, C } = heatSum(input.masses)
  const W = input.waterG
  const mixTarget = input.targetC - input.mixerRiseC
  const Q = input.newFlourG * Q_HYDRATION
  if (W <= 0) {
    return {
      idealWaterC: NaN,
      waterC: NaN,
      iceG: 0,
      liquidG: 0,
      expectedC: doughTempFor(input, 0, 0),
      status: 'ok',
    }
  }
  const ideal = (mixTarget * (C + W * C_WATER) - H - Q) / (W * C_WATER)
  const maxWater = Math.max(input.tapC, input.maxWaterC ?? DEFAULT_MAX_WATER_C)

  if (ideal > maxWater) {
    return {
      idealWaterC: ideal,
      waterC: maxWater,
      iceG: 0,
      liquidG: W,
      expectedC: doughTempFor(input, maxWater),
      status: 'too-hot',
    }
  }
  if (ideal >= input.tapC) {
    return { idealWaterC: ideal, waterC: ideal, iceG: 0, liquidG: W, expectedC: input.targetC, status: 'ok' }
  }
  // Replace part of the water with 0 °C ice; the liquid part comes from the tap.
  const tap = input.tapC
  const ice = (H + Q + W * C_WATER * tap - mixTarget * (C + W * C_WATER)) / (C_WATER * tap + L_FUSION)
  const maxIce = W * MAX_ICE_SHARE
  // A token amount of ice is silly: a few degrees under the tap is just fridge-cold water.
  if (ice < Math.max(8, W * 0.04) && ideal >= 2) {
    return { idealWaterC: ideal, waterC: ideal, iceG: 0, liquidG: W, expectedC: input.targetC, status: 'ok' }
  }
  if (ice <= maxIce) {
    const iceG = Math.max(0, ice)
    return { idealWaterC: ideal, waterC: tap, iceG, liquidG: W - iceG, expectedC: input.targetC, status: 'ice' }
  }
  // Too much ice needed: cap it and say how cold the flour would have to be.
  const expected = doughTempFor(input, tap, maxIce)
  const flour = input.masses.find((m) => m.label === 'flour')
  let flourNeededC: number | undefined
  if (flour && flour.massG > 0) {
    const others = input.masses.filter((m) => m !== flour)
    const o = heatSum(others)
    const Cf = flour.massG * flour.cp
    const needH = mixTarget * (C + W * C_WATER) - Q - (W - maxIce) * C_WATER * tap + maxIce * L_FUSION - o.H
    flourNeededC = needH / Cf
  }
  return {
    idealWaterC: ideal,
    waterC: tap,
    iceG: maxIce,
    liquidG: W - maxIce,
    expectedC: expected,
    status: 'too-cold',
    flourNeededC,
  }
}

/**
 * The classic bakers' Desired Dough Temperature rule, for comparison:
 * T_water = n·DDT − (T_flour + T_room + FF + ΣT_preferment), n = 3 + number of preferments.
 */
export function classicWaterTemp(opts: {
  targetC: number
  flourC: number
  roomC: number
  frictionFactorC: number
  prefermentTempsC: number[]
}): number {
  const n = 3 + opts.prefermentTempsC.length
  return (
    n * opts.targetC -
    (opts.flourC + opts.roomC + opts.frictionFactorC + opts.prefermentTempsC.reduce((s, t) => s + t, 0))
  )
}

/** Back-solves a mixer's mechanical temperature rise from one real mix (calibration). */
export function calibrateMixerRise(
  input: Pick<WaterSolveInput, 'masses' | 'waterG' | 'newFlourG'> & { waterC: number; iceG: number; measuredC: number },
): number {
  const noMixer = doughTempFor({ ...input, mixerRiseC: 0 }, input.waterC, input.iceG)
  return input.measuredC - noMixer
}
