/**
 * Mixer profiles. `riseC` is the purely mechanical temperature rise of a typical pizza mix
 * (hydration heat is modelled separately), back-calculated from published friction factors and
 * measured heating rates — calibrate it with one real batch. `classicFF` is the equivalent
 * 3-factor sum-term used by the traditional DDT formula (°C).
 */
export interface MixerPreset {
  id: string
  name: string
  emoji: string
  riseC: number
  range: [number, number]
  classicFF: number
  /** Typical minutes of mixing + kneading (plus rests) for pizza dough. */
  mixMinutes: number
  blurb: string
}

export const MIXERS: MixerPreset[] = [
  {
    id: 'hand',
    name: 'By hand',
    emoji: '✋',
    riseC: 0,
    range: [-1, 1.5],
    classicFF: 3,
    mixMinutes: 25,
    blurb: 'Kneading or stretch-and-folds. Hands add a little heat, the bench takes it away.',
  },
  {
    id: 'fork',
    name: 'Fork mixer',
    emoji: '🍴',
    riseC: 1,
    range: [0.5, 2],
    classicFF: 4,
    mixMinutes: 22,
    blurb: 'Famag / Pietroberto style. Very gentle — ideal for biga and high hydration.',
  },
  {
    id: 'diving',
    name: 'Diving / twin arm',
    emoji: '🦾',
    riseC: 1.5,
    range: [1, 3],
    classicFF: 6,
    mixMinutes: 20,
    blurb: 'Slow, folding action with little heating.',
  },
  {
    id: 'spiral',
    name: 'Spiral mixer',
    emoji: '🌀',
    riseC: 3.5,
    range: [2, 6],
    classicFF: 9,
    mixMinutes: 18,
    blurb: 'Pro or home spiral (Famag, Häussler, Ooni Halo). 2nd speed heats fast.',
  },
  {
    id: 'planetary',
    name: 'Stand mixer',
    emoji: '🎂',
    riseC: 3.5,
    range: [2, 6],
    classicFF: 13,
    mixMinutes: 18,
    blurb: 'KitchenAid, Kenwood, Bosch with a hook. Heats the most per minute — keep speeds low.',
  },
  {
    id: 'ankarsrum',
    name: 'Ankarsrum',
    emoji: '⚙️',
    riseC: 2.5,
    range: [1.5, 4],
    classicFF: 11,
    mixMinutes: 18,
    blurb: 'Roller & scraper; moderate heating.',
  },
  {
    id: 'processor',
    name: 'Food processor',
    emoji: '🔪',
    riseC: 4,
    range: [2, 7],
    classicFF: 17,
    mixMinutes: 10,
    blurb: '45–90 s of processing, and it heats the dough by several degrees a minute. Use cold water.',
  },
  {
    id: 'breadmachine',
    name: 'Bread machine',
    emoji: '🍞',
    riseC: 5,
    range: [3, 8],
    classicFF: 14,
    mixMinutes: 25,
    blurb: 'Dough cycle kneading; some models warm the pan.',
  },
]

export const mixerById = (id: string): MixerPreset => MIXERS.find((m) => m.id === id) ?? MIXERS[0]
