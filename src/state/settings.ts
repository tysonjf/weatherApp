import type { YeastType } from '../engine/types'
import type { TempUnit, WeightUnit } from '../engine/units'
import { DEFAULT_MAX_WATER_C } from '../engine/temperature'

export type Theme = 'auto' | 'light' | 'dark'
export type TimeFormat = '24h' | '12h'

export interface Settings {
  tempUnit: TempUnit
  weightUnit: WeightUnit
  theme: Theme
  timeFormat: TimeFormat
  yeastType: YeastType
  /** Kitchen defaults used for new recipes. */
  roomC: number
  /** Night-time room temperature (null = the room doesn't cool down at night). */
  nightC: number | null
  fridgeC: number
  tapC: number
  /** Warmest water the app will suggest; beyond it cold preferments rest out of the fridge and the mix runs longer. */
  maxWaterC: number
  mixerId: string
  /** Calibrated temperature rise per mixer id (°C), set by the friction calibration tool. */
  mixerRise: Record<string, number>
  /** Show the classic bakers' DDT formula alongside the physics-based water temperature. */
  showClassicDdt: boolean
  /** Personal calibration on every computed commercial-yeast amount (1 = model as-is). */
  yeastScale: number
  /** How fast your starter is compared with the model (1 = as modelled, 0.8 = 25 % slower). */
  starterSpeed: number
  /** Altitude of your kitchen in metres. */
  altitudeM: number
  /** Resolution of your kitchen scale (g). */
  scaleStepG: number
  /** My day: no hands-on steps while asleep (local hours; may wrap past midnight) or at work. */
  sleepFrom: number
  sleepTo: number
  workOn: boolean
  workFrom: number
  workTo: number
}

export const DEFAULT_SETTINGS: Settings = {
  tempUnit: 'C',
  weightUnit: 'g',
  theme: 'auto',
  timeFormat: '24h',
  yeastType: 'instant',
  roomC: 21,
  nightC: null,
  fridgeC: 4,
  tapC: 10,
  maxWaterC: DEFAULT_MAX_WATER_C,
  mixerId: 'hand',
  mixerRise: {},
  showClassicDdt: false,
  yeastScale: 1,
  starterSpeed: 1,
  altitudeM: 0,
  scaleStepG: 1,
  sleepFrom: 23,
  sleepTo: 7,
  workOn: false,
  workFrom: 9,
  workTo: 17.5,
}
