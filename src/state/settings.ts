import type { YeastType } from '../engine/types'
import type { TempUnit, WeightUnit } from '../engine/units'

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
  mixerId: string
  /** Calibrated temperature rise per mixer id (°C), set by the friction calibration tool. */
  mixerRise: Record<string, number>
  /** Show the classic bakers' DDT formula alongside the physics-based water temperature. */
  showClassicDdt: boolean
  /** Personal calibration on every computed yeast / starter amount (1 = model as-is). */
  yeastScale: number
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
  mixerId: 'hand',
  mixerRise: {},
  showClassicDdt: false,
  yeastScale: 1,
}
