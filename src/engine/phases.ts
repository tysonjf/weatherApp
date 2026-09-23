import type { KitchenSpec, Phase, PhaseLocation } from './types'

let counter = 0
export const uid = (prefix = 'id'): string =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export function phaseTempC(phase: Phase, kitchen: Pick<KitchenSpec, 'roomC' | 'fridgeC'>): number {
  switch (phase.location) {
    case 'room':
      return kitchen.roomC
    case 'fridge':
      return kitchen.fridgeC
    default:
      return phase.customTempC
  }
}

export function makePhase(
  location: PhaseLocation,
  hours: number,
  stage?: 'bulk' | 'balls',
  customTempC = 18,
): Phase {
  return { id: uid('ph'), location, hours, stage, customTempC }
}

export const totalHours = (phases: Phase[]): number => phases.reduce((s, p) => s + Math.max(0, p.hours), 0)

export function locationLabel(loc: PhaseLocation): string {
  return loc === 'room' ? 'Room' : loc === 'fridge' ? 'Fridge' : 'Controlled'
}
