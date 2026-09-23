import type { PhaseLocation, PrefermentType, Sizing } from './types'

/* ------------------------------------------------------------------ */
/* Ovens                                                               */
/* ------------------------------------------------------------------ */

export interface OvenPreset {
  id: string
  name: string
  emoji: string
  /** Floor / stone temperature range (°C). */
  tempC: [number, number]
  bake: string
  preheatMin: number
  /** Formula hints for this oven. */
  advice: { oil: [number, number]; sugar: [number, number]; malt: [number, number] }
  blurb: string
}

export const OVENS: OvenPreset[] = [
  {
    id: 'wood',
    name: 'Wood-fired',
    emoji: '🪵',
    tempC: [430, 485],
    bake: '60–90 s',
    preheatMin: 120,
    advice: { oil: [0, 0], sugar: [0, 0], malt: [0, 0] },
    blurb: 'Floor 430 °C+, dome ~485 °C. The Neapolitan benchmark.',
  },
  {
    id: 'portable',
    name: 'Portable gas oven',
    emoji: '🔥',
    tempC: [400, 480],
    bake: '60–120 s',
    preheatMin: 30,
    advice: { oil: [0, 1], sugar: [0, 0], malt: [0, 0.5] },
    blurb: 'Ooni Koda/Karu, Gozney Roccbox/Dome/Arc. Check the stone with an IR thermometer.',
  },
  {
    id: 'electric-hot',
    name: 'Electric pizza oven',
    emoji: '⚡',
    tempC: [350, 450],
    bake: '90 s – 3 min',
    preheatMin: 30,
    advice: { oil: [0, 2], sugar: [0, 1], malt: [0, 0.5] },
    blurb: 'Effeuno, Ooni Volt, Breville/Sage Pizzaiolo, G3 Ferrari.',
  },
  {
    id: 'home-steel',
    name: 'Home oven + steel',
    emoji: '🏠',
    tempC: [260, 300],
    bake: '5–8 min',
    preheatMin: 60,
    advice: { oil: [2, 4], sugar: [1, 2], malt: [0.5, 1.5] },
    blurb: 'Max temperature, steel on a high rack, broiler for the last minutes.',
  },
  {
    id: 'home-stone',
    name: 'Home oven + stone',
    emoji: '🪨',
    tempC: [250, 290],
    bake: '7–12 min',
    preheatMin: 60,
    advice: { oil: [2, 4], sugar: [1, 2], malt: [0.5, 1.5] },
    blurb: 'Preheat at least 45–60 minutes so the stone is saturated.',
  },
  {
    id: 'home-pan',
    name: 'Home oven, pans',
    emoji: '🍳',
    tempC: [230, 290],
    bake: '12–20 min',
    preheatMin: 40,
    advice: { oil: [0, 5], sugar: [0, 1.5], malt: [0, 0.3] },
    blurb: 'Detroit, Sicilian, grandma, teglia and focaccia — lowest rack for a crisp base.',
  },
  {
    id: 'deck',
    name: 'Deck oven',
    emoji: '🏭',
    tempC: [290, 320],
    bake: '5–13 min',
    preheatMin: 60,
    advice: { oil: [1, 3], sugar: [0, 1], malt: [0, 1] },
    blurb: 'NY slice shops and Roman pizza al taglio.',
  },
]

export const ovenById = (id: string): OvenPreset => OVENS.find((o) => o.id === id) ?? OVENS[0]

/* ------------------------------------------------------------------ */
/* Flours                                                              */
/* ------------------------------------------------------------------ */

export interface FlourPreset {
  id: string
  name: string
  protein: string
  /** Alveograph W range (US flours are estimates). */
  w: [number, number]
  note: string
}

export const FLOURS: FlourPreset[] = [
  { id: 'generic-00-medium', name: 'Pizza 00 (W 250–280)', protein: '11.5–12.5 %', w: [250, 280], note: 'Typical Neapolitan pizzeria flour.' },
  { id: 'caputo-pizzeria', name: 'Caputo Pizzeria (blue)', protein: '12.5 %', w: [260, 270], note: '8–24 h at room temperature, 430–485 °C ovens.' },
  { id: 'caputo-nuvola', name: 'Caputo Nuvola', protein: '12.5–13.5 %', w: [270, 300], note: 'Type 0, for airy contemporary rims.' },
  { id: 'caputo-chef', name: 'Caputo Cuoco / Chef (red)', protein: '13 %', w: [300, 320], note: 'Long and cold fermentations.' },
  { id: 'caputo-manitoba', name: 'Caputo Manitoba Oro', protein: '14.5 %', w: [360, 400], note: 'Biga and blending flour.' },
  { id: '5s-napoletana', name: 'Le 5 Stagioni Napoletana', protein: '12–12.5 %', w: [250, 270], note: 'Direct doughs, short to medium times.' },
  { id: '5s-superiore', name: 'Le 5 Stagioni Superiore', protein: '13–13.5 %', w: [330, 360], note: 'Long fermentation and biga.' },
  { id: 'generic-strong', name: 'Strong 00/0 (W 320–380)', protein: '13–14 %', w: [320, 380], note: 'Biga, 48 h+ cold, high hydration.' },
  { id: 'us-ap', name: 'All-purpose (US, ~11.7 %)', protein: '11.7 %', w: [230, 260], note: 'Malted. Same-day and 24 h doughs.' },
  { id: 'us-bread', name: 'Bread flour (~12.7 %)', protein: '12.7 %', w: [280, 320], note: 'Malted. NY, Detroit, pan styles.' },
  { id: 'us-hi-gluten', name: 'High-gluten (All Trumps, Sir Lancelot)', protein: '14.2 %', w: [350, 390], note: 'Malted. Classic NY slice, long cold ferments.' },
]

export const flourById = (id: string): FlourPreset => FLOURS.find((f) => f.id === id) ?? FLOURS[0]

/**
 * Recommended flour strength for a fermentation load expressed as equivalent hours at 20 °C
 * (Casucci's W-vs-hours table merged with common Italian mill guidance).
 */
export function recommendedW(equivHours20: number): { min: number; max: number } {
  const h = equivHours20
  if (h <= 4) return { min: 170, max: 220 }
  if (h <= 8) return { min: 200, max: 250 }
  if (h <= 14) return { min: 230, max: 280 }
  if (h <= 24) return { min: 250, max: 300 }
  if (h <= 36) return { min: 270, max: 320 }
  if (h <= 60) return { min: 300, max: 350 }
  return { min: 330, max: 400 }
}

/* ------------------------------------------------------------------ */
/* Preferment types                                                    */
/* ------------------------------------------------------------------ */

export interface PrefermentPreset {
  type: PrefermentType
  name: string
  emoji: string
  blurb: string
  leavening: 'yeast' | 'sourdough'
  hydration: number
  hydrationRange: [number, number]
  flourPct: number
  targetTempC: number
  saltPct: number
  honeyPct: number
  seedHydration: number
  /** Default schedule. 'custom' temps use customTempC. */
  schedule: { location: PhaseLocation; hours: number; customTempC?: number }[]
  /**
   * Leavening power of the ripe preferment in the final dough, as fresh-yeast-equivalent % of
   * the preferment's flour (calibrated so 100 % biga / 30 % poolish doughs match practice).
   */
  carryFreshPct: number
  color: 'biga' | 'poolish' | 'sourdough' | 'other'
}

export const PREFERMENTS: PrefermentPreset[] = [
  {
    type: 'biga',
    name: 'Biga',
    emoji: '🧱',
    blurb: 'Stiff (44–50 %), slow and aromatic. Light, crunchy, open crumb. Giorilli: 1 % fresh yeast, 18 °C, 16–24 h.',
    leavening: 'yeast',
    hydration: 45,
    hydrationRange: [40, 60],
    flourPct: 50,
    targetTempC: 19,
    saltPct: 0,
    honeyPct: 0,
    seedHydration: 100,
    schedule: [{ location: 'custom', hours: 18, customTempC: 18 }],
    carryFreshPct: 1.0,
    color: 'biga',
  },
  {
    type: 'poolish',
    name: 'Poolish',
    emoji: '🫧',
    blurb: 'Liquid (100 %), fast and extensible. Nutty, sweet flavour and easy stretching.',
    leavening: 'yeast',
    hydration: 100,
    hydrationRange: [90, 110],
    flourPct: 30,
    targetTempC: 21,
    saltPct: 0,
    honeyPct: 0,
    seedHydration: 100,
    schedule: [{ location: 'room', hours: 14 }],
    carryFreshPct: 1.0,
    color: 'poolish',
  },
  {
    type: 'sponge',
    name: 'Sponge',
    emoji: '🧽',
    blurb: 'Medium hydration (60–70 %) all-rounder, between biga and poolish.',
    leavening: 'yeast',
    hydration: 65,
    hydrationRange: [55, 80],
    flourPct: 30,
    targetTempC: 21,
    saltPct: 0,
    honeyPct: 0,
    seedHydration: 100,
    schedule: [{ location: 'room', hours: 12 }],
    carryFreshPct: 1.0,
    color: 'other',
  },
  {
    type: 'pate-fermentee',
    name: 'Old dough',
    emoji: '♻️',
    blurb: 'Pâte fermentée: a piece of finished, salted dough fermented 8–24 h. Adds maturity fast.',
    leavening: 'yeast',
    hydration: 65,
    hydrationRange: [55, 75],
    flourPct: 20,
    targetTempC: 22,
    saltPct: 2,
    honeyPct: 0,
    seedHydration: 100,
    schedule: [
      { location: 'room', hours: 1 },
      { location: 'fridge', hours: 16 },
    ],
    carryFreshPct: 0.9,
    color: 'other',
  },
  {
    type: 'lievito-madre',
    name: 'Lievito madre',
    emoji: '🫙',
    blurb: 'Stiff sourdough (≈50 %). Mild acidity, strong leavening. Fed 1 : 1 : 0.5, peaks in 3–4 h at 26–28 °C.',
    leavening: 'sourdough',
    hydration: 50,
    hydrationRange: [40, 60],
    flourPct: 15,
    targetTempC: 26,
    saltPct: 0,
    honeyPct: 0,
    seedHydration: 50,
    schedule: [{ location: 'room', hours: 4 }],
    carryFreshPct: 0,
    color: 'sourdough',
  },
  {
    type: 'licoli',
    name: 'Licoli (liquid levain)',
    emoji: '🥛',
    blurb: 'Liquid sourdough (100 %). Lactic and lively. 1 : 1 : 1 peaks in ~4–6 h at 24 °C.',
    leavening: 'sourdough',
    hydration: 100,
    hydrationRange: [80, 125],
    flourPct: 15,
    targetTempC: 25,
    saltPct: 0,
    honeyPct: 0,
    seedHydration: 100,
    schedule: [{ location: 'room', hours: 5 }],
    carryFreshPct: 0,
    color: 'sourdough',
  },
  {
    type: 'custom',
    name: 'Custom preferment',
    emoji: '🧪',
    blurb: 'Any hydration, any schedule.',
    leavening: 'yeast',
    hydration: 70,
    hydrationRange: [30, 150],
    flourPct: 25,
    targetTempC: 21,
    saltPct: 0,
    honeyPct: 0,
    seedHydration: 100,
    schedule: [{ location: 'room', hours: 12 }],
    carryFreshPct: 1.0,
    color: 'other',
  },
]

export const prefermentPreset = (type: PrefermentType): PrefermentPreset =>
  PREFERMENTS.find((p) => p.type === type) ?? PREFERMENTS[PREFERMENTS.length - 1]

/* ------------------------------------------------------------------ */
/* Final dough schedule templates                                      */
/* ------------------------------------------------------------------ */

export interface ScheduleTemplate {
  id: string
  name: string
  blurb: string
  phases: { location: PhaseLocation; hours: number; stage: 'bulk' | 'balls' }[]
}

export const SCHEDULES: ScheduleTemplate[] = [
  {
    id: 'same-day',
    name: 'Same day',
    blurb: '2 h bulk + 6 h balls at room temperature.',
    phases: [
      { location: 'room', hours: 2, stage: 'bulk' },
      { location: 'room', hours: 6, stage: 'balls' },
    ],
  },
  {
    id: 'room-24',
    name: '24 h at room',
    blurb: 'Neapolitan classic: 2 h bulk, 22 h balls, tiny yeast dose.',
    phases: [
      { location: 'room', hours: 2, stage: 'bulk' },
      { location: 'room', hours: 22, stage: 'balls' },
    ],
  },
  {
    id: 'cold-balls-24',
    name: 'Cold balls 24 h',
    blurb: '1 h bulk, balls into the fridge 20 h, 3 h out before baking.',
    phases: [
      { location: 'room', hours: 1, stage: 'bulk' },
      { location: 'fridge', hours: 20, stage: 'balls' },
      { location: 'room', hours: 3, stage: 'balls' },
    ],
  },
  {
    id: 'cold-balls-48',
    name: 'Cold balls 48 h',
    blurb: 'NY-style: ball straight away, 45 h cold, 3 h tempering.',
    phases: [
      { location: 'room', hours: 0.5, stage: 'bulk' },
      { location: 'fridge', hours: 45, stage: 'balls' },
      { location: 'room', hours: 3, stage: 'balls' },
    ],
  },
  {
    id: 'cold-bulk-48',
    name: 'Cold bulk 48 h',
    blurb: '1 h bulk at room, 42 h bulk in the fridge, ball and proof 5 h.',
    phases: [
      { location: 'room', hours: 1, stage: 'bulk' },
      { location: 'fridge', hours: 42, stage: 'bulk' },
      { location: 'room', hours: 5, stage: 'balls' },
    ],
  },
  {
    id: 'cold-72',
    name: '72 h cold',
    blurb: 'Long maturation: 24 h bulk cold, 45 h balls cold, 3 h out.',
    phases: [
      { location: 'room', hours: 1, stage: 'bulk' },
      { location: 'fridge', hours: 23, stage: 'bulk' },
      { location: 'fridge', hours: 45, stage: 'balls' },
      { location: 'room', hours: 3, stage: 'balls' },
    ],
  },
  {
    id: 'after-preferment',
    name: 'Quick after preferment',
    blurb: 'For biga/poolish doughs: 1 h bulk, 4 h balls at room.',
    phases: [
      { location: 'room', hours: 1, stage: 'bulk' },
      { location: 'room', hours: 4, stage: 'balls' },
    ],
  },
  {
    id: 'sourdough-day',
    name: 'Sourdough, same day',
    blurb: 'Natural leavening needs longer: 3 h bulk + 6 h balls at room.',
    phases: [
      { location: 'room', hours: 3, stage: 'bulk' },
      { location: 'room', hours: 6, stage: 'balls' },
    ],
  },
  {
    id: 'pan-same-day',
    name: 'Pan, same day',
    blurb: '2 h bulk with folds, 2.5 h proof in the pan.',
    phases: [
      { location: 'room', hours: 2, stage: 'bulk' },
      { location: 'room', hours: 2.5, stage: 'balls' },
    ],
  },
  {
    id: 'pan-overnight',
    name: 'Pan, no-knead',
    blurb: "Kenji-style: 12 h bulk at room, 2 h proof in the pan.",
    phases: [
      { location: 'room', hours: 12, stage: 'bulk' },
      { location: 'room', hours: 2, stage: 'balls' },
    ],
  },
  {
    id: 'pan-cold',
    name: 'Pan, cold',
    blurb: '2 h bulk, 24 h cold, 3 h in the pan.',
    phases: [
      { location: 'room', hours: 2, stage: 'bulk' },
      { location: 'fridge', hours: 24, stage: 'bulk' },
      { location: 'room', hours: 3, stage: 'balls' },
    ],
  },
]

export const scheduleById = (id: string): ScheduleTemplate => SCHEDULES.find((s) => s.id === id) ?? SCHEDULES[0]

/* ------------------------------------------------------------------ */
/* Pizza styles                                                        */
/* ------------------------------------------------------------------ */

export interface StylePreset {
  id: string
  name: string
  emoji: string
  blurb: string
  sizing: Partial<Sizing> & Pick<Sizing, 'mode'>
  ballRange?: [number, number]
  /** g/cm² range for pan styles. */
  tfRange?: [number, number]
  hydration: number
  hydrationRange: [number, number]
  saltPct: number
  oilPct: number
  sugarPct: number
  maltPct: number
  targetFdtC: number
  ovenId: string
  flourId: string
  scheduleId: string
  /** Default preferments for the indirect method of this style. */
  method: 'direct' | 'indirect'
  preferments?: { type: PrefermentType; flourPct: number }[]
  reservePct: number
  wastePct: number
  /** Default fermentation target (see FinalDoughSpec.proofTarget). */
  proofTarget: number
  diameter?: string
  bake: string
  shaping: string
}

export const STYLES: StylePreset[] = [
  {
    id: 'neapolitan',
    name: 'Neapolitan (AVPN)',
    emoji: '🍕',
    blurb: 'Soft, puffy cornicione, 60–90 s in a blazing oven. Flour, water, salt, yeast — nothing else.',
    sizing: { mode: 'balls', count: 6, ballWeight: 250 },
    ballRange: [200, 280],
    hydration: 60,
    hydrationRange: [55.5, 62.5],
    saltPct: 2.8,
    oilPct: 0,
    sugarPct: 0,
    maltPct: 0,
    targetFdtC: 24,
    ovenId: 'wood',
    flourId: 'caputo-pizzeria',
    scheduleId: 'room-24',
    method: 'direct',
    reservePct: 0,
    wastePct: 1.5,
    proofTarget: 1,
    diameter: '250 g → 30–32 cm',
    bake: '430–485 °C, 60–90 s',
    shaping: 'Press from the centre out with fingertips leaving a 1–2 cm rim, then slap-stretch to 30 cm. No rolling pin.',
  },
  {
    id: 'canotto',
    name: 'Contemporary (canotto)',
    emoji: '🛟',
    blurb: 'High hydration and a big, airy "rubber-dinghy" rim, usually with biga or poolish.',
    sizing: { mode: 'balls', count: 6, ballWeight: 270 },
    ballRange: [250, 300],
    hydration: 70,
    hydrationRange: [65, 78],
    saltPct: 2.8,
    oilPct: 0,
    sugarPct: 0,
    maltPct: 0,
    targetFdtC: 24,
    ovenId: 'portable',
    flourId: 'caputo-nuvola',
    scheduleId: 'after-preferment',
    method: 'indirect',
    preferments: [{ type: 'biga', flourPct: 50 }],
    reservePct: 8,
    wastePct: 2,
    proofTarget: 1,
    diameter: '270 g → 30–32 cm',
    bake: '430–480 °C, 60–90 s',
    shaping: 'Few, gentle presses in the centre only; push the gas into a wide 2–3 cm rim.',
  },
  {
    id: 'ny',
    name: 'New York',
    emoji: '🗽',
    blurb: 'Big, foldable slices with a crisp-chewy crust. Oil and sugar help it brown in a home oven.',
    sizing: { mode: 'balls', count: 3, ballWeight: 450 },
    ballRange: [280, 650],
    hydration: 63,
    hydrationRange: [58, 66],
    saltPct: 2,
    oilPct: 2,
    sugarPct: 1,
    maltPct: 0,
    targetFdtC: 22,
    ovenId: 'home-steel',
    flourId: 'us-bread',
    scheduleId: 'cold-balls-48',
    method: 'direct',
    reservePct: 0,
    wastePct: 1.5,
    proofTarget: 1,
    diameter: '450 g → 38 cm (15″); TF 0.09 oz/in²',
    bake: 'Steel at 260–290 °C, 5–8 min; deck 290–315 °C',
    shaping: 'Press a 1–2 cm lip, then knuckle-stretch or toss. Thin, even centre.',
  },
  {
    id: 'roman',
    name: 'Roman tonda',
    emoji: '🥨',
    blurb: 'Paper-thin and crackly (scrocchiarella), rolled with a pin. Oil in the dough.',
    sizing: { mode: 'balls', count: 6, ballWeight: 180 },
    ballRange: [160, 210],
    hydration: 56,
    hydrationRange: [50, 60],
    saltPct: 2.2,
    oilPct: 4,
    sugarPct: 0,
    maltPct: 1,
    targetFdtC: 23,
    ovenId: 'electric-hot',
    flourId: 'caputo-chef',
    scheduleId: 'cold-72',
    method: 'direct',
    reservePct: 0,
    wastePct: 1.5,
    proofTarget: 1,
    diameter: '180 g → 30–33 cm, 2–3 mm thick',
    bake: '330–380 °C, 2–3 min (home: steel 280–300 °C, 4–6 min)',
    shaping: 'Roll on semola with a rolling pin to 2–3 mm, no rim. Dock if it balloons.',
  },
  {
    id: 'teglia',
    name: 'Roman teglia',
    emoji: '🟫',
    blurb: 'Pizza al taglio: very high hydration, long cold maturation, baked in a blue-steel pan.',
    sizing: { mode: 'pans', count: 1, panShape: 'rect', panWidthCm: 30, panLengthCm: 40, thicknessFactor: 0.55 },
    tfRange: [0.5, 0.6],
    hydration: 80,
    hydrationRange: [75, 85],
    saltPct: 2.5,
    oilPct: 3,
    sugarPct: 0,
    maltPct: 0.3,
    targetFdtC: 23,
    ovenId: 'home-pan',
    flourId: 'generic-strong',
    scheduleId: 'pan-cold',
    method: 'direct',
    reservePct: 12,
    wastePct: 3,
    proofTarget: 1.2,
    bake: 'Home 250–280 °C, 12–18 min on the lowest rack',
    shaping: 'Tip the panetto onto semola, extend with fingertips without degassing, transfer to an oiled pan.',
  },
  {
    id: 'detroit',
    name: 'Detroit',
    emoji: '🟥',
    blurb: 'Thick, airy squares with a lacy, caramelised cheese crown (frico) from the pan walls.',
    sizing: { mode: 'pans', count: 1, panShape: 'rect', panWidthCm: 25.4, panLengthCm: 35.6, thicknessFactor: 0.57 },
    tfRange: [0.53, 0.7],
    hydration: 70,
    hydrationRange: [65, 76],
    saltPct: 2,
    oilPct: 1,
    sugarPct: 1,
    maltPct: 0,
    targetFdtC: 24,
    ovenId: 'home-pan',
    flourId: 'us-bread',
    scheduleId: 'pan-same-day',
    method: 'direct',
    reservePct: 0,
    wastePct: 2,
    proofTarget: 1.4,
    bake: '250–290 °C, 12–15 min',
    shaping: 'Press into a well-oiled 10×14″ pan; if it springs back, wait 20–60 min and press into the corners.',
  },
  {
    id: 'sicilian',
    name: 'Sicilian / Grandma',
    emoji: '🟨',
    blurb: 'Olive-oily sheet-pan pizza. Sicilian is thick and puffy; grandma thinner and crisp.',
    sizing: { mode: 'pans', count: 1, panShape: 'rect', panWidthCm: 33, panLengthCm: 46, thicknessFactor: 0.5 },
    tfRange: [0.4, 0.66],
    hydration: 68,
    hydrationRange: [62, 75],
    saltPct: 2,
    oilPct: 3.5,
    sugarPct: 1,
    maltPct: 0,
    targetFdtC: 24,
    ovenId: 'home-pan',
    flourId: 'us-bread',
    scheduleId: 'pan-same-day',
    method: 'direct',
    reservePct: 0,
    wastePct: 2,
    proofTarget: 1.4,
    bake: '230–260 °C, 15–25 min (grandma 260 °C, 12–18 min)',
    shaping: 'Stretch in a generously oiled half-sheet; proof until puffy (grandma: short proof, press thin).',
  },
  {
    id: 'pan',
    name: 'Cast-iron pan pizza',
    emoji: '🍳',
    blurb: "Kenji's foolproof pan pizza: fried, crisp base and a soft, bready crumb.",
    sizing: { mode: 'pans', count: 2, panShape: 'round', panDiameterCm: 25.4, thicknessFactor: 0.69 },
    tfRange: [0.55, 0.75],
    hydration: 68.75,
    hydrationRange: [65, 72],
    saltPct: 2.5,
    oilPct: 2,
    sugarPct: 0,
    maltPct: 0,
    targetFdtC: 24,
    ovenId: 'home-pan',
    flourId: 'us-bread',
    scheduleId: 'pan-overnight',
    method: 'direct',
    reservePct: 0,
    wastePct: 1.5,
    proofTarget: 1.4,
    bake: '290 °C, 12–15 min, then 1–3 min on the hob if needed',
    shaping: 'Ball into an oiled skillet, flatten, rest 2 h, press to the edges.',
  },
  {
    id: 'tavern',
    name: 'Chicago tavern',
    emoji: '🍺',
    blurb: 'Cracker-thin, rolled and cured, cut in squares. Low hydration, lots of oil.',
    sizing: { mode: 'balls', count: 2, ballWeight: 300 },
    ballRange: [250, 350],
    hydration: 51,
    hydrationRange: [45, 55],
    saltPct: 1.5,
    oilPct: 7,
    sugarPct: 1,
    maltPct: 0,
    targetFdtC: 21,
    ovenId: 'home-steel',
    flourId: 'us-hi-gluten',
    scheduleId: 'cold-balls-48',
    method: 'direct',
    reservePct: 0,
    wastePct: 12,
    proofTarget: 0.9,
    diameter: '300 g → 36 cm (14″) after trimming',
    bake: '260–290 °C, 8–12 min',
    shaping: 'Roll to 2–3 mm, dock well, cure uncovered in the fridge 12–24 h, flip and trim.',
  },
  {
    id: 'pinsa',
    name: 'Pinsa romana',
    emoji: '🫓',
    blurb: 'Oval, very hydrated and light; traditionally a wheat, rice and soy flour blend.',
    sizing: { mode: 'balls', count: 4, ballWeight: 250 },
    ballRange: [230, 300],
    hydration: 78,
    hydrationRange: [70, 85],
    saltPct: 2.2,
    oilPct: 2,
    sugarPct: 0,
    maltPct: 0,
    targetFdtC: 23,
    ovenId: 'home-steel',
    flourId: 'generic-strong',
    scheduleId: 'cold-72',
    method: 'direct',
    reservePct: 10,
    wastePct: 3,
    proofTarget: 1.1,
    diameter: '250 g → ~30×20 cm oval',
    bake: '280–320 °C, 5–8 min',
    shaping: 'Oval preshape; dimple and extend with fingertips, keeping the bubbles.',
  },
  {
    id: 'focaccia',
    name: 'Focaccia',
    emoji: '🫒',
    blurb: 'Bonus: bubbly, oil-rich sheet bread. Same engine, different pan.',
    sizing: { mode: 'pans', count: 1, panShape: 'rect', panWidthCm: 33, panLengthCm: 46, thicknessFactor: 0.62 },
    tfRange: [0.45, 0.7],
    hydration: 80,
    hydrationRange: [70, 90],
    saltPct: 2.2,
    oilPct: 4,
    sugarPct: 0.7,
    maltPct: 0,
    targetFdtC: 24,
    ovenId: 'home-pan',
    flourId: 'us-bread',
    scheduleId: 'pan-cold',
    method: 'direct',
    reservePct: 10,
    wastePct: 3,
    proofTarget: 1.4,
    bake: '220–250 °C, 18–25 min',
    shaping: 'Stretch in an oiled pan in two stages; dimple deeply with oiled fingers before baking.',
  },
  {
    id: 'custom',
    name: 'Custom',
    emoji: '🧑‍🍳',
    blurb: 'Start from a neutral dough and set everything yourself.',
    sizing: { mode: 'balls', count: 4, ballWeight: 250 },
    ballRange: [100, 1000],
    hydration: 65,
    hydrationRange: [45, 95],
    saltPct: 2.5,
    oilPct: 0,
    sugarPct: 0,
    maltPct: 0,
    targetFdtC: 24,
    ovenId: 'home-steel',
    flourId: 'generic-00-medium',
    scheduleId: 'cold-balls-24',
    method: 'direct',
    reservePct: 0,
    wastePct: 1.5,
    proofTarget: 1,
    bake: 'Depends on your oven',
    shaping: 'Your call.',
  },
]

export const styleById = (id: string): StylePreset => STYLES.find((s) => s.id === id) ?? STYLES[0]
