/**
 * Domain model for Pizza Weather.
 *
 * Conventions:
 *  - Weights in grams, temperatures in °C, durations in hours.
 *  - Every "Pct" field is a baker's percentage (65 means 65 %).
 *  - Recipe-level percentages are relative to TOTAL flour (including flour inside preferments).
 *  - Preferment-level percentages are relative to that preferment's own flour.
 *  - Commercial yeast amounts are handled internally as fresh (compressed) yeast
 *    equivalents and converted to the user's yeast type for display.
 */

export type YeastType = 'fresh' | 'active-dry' | 'instant'

/** Where a fermentation phase happens. Room and fridge temperatures come from the kitchen settings. */
export type PhaseLocation = 'room' | 'fridge' | 'custom'

export interface Phase {
  id: string
  location: PhaseLocation
  /** Used when location === 'custom' (e.g. a wine fridge at 16–18 °C for biga). */
  customTempC: number
  hours: number
  /** Final dough only: bulk (puntata) happens before balling, balls (appretto) after. */
  stage?: 'bulk' | 'balls'
}

export type PrefermentType =
  | 'biga'
  | 'poolish'
  | 'sponge'
  | 'pate-fermentee'
  | 'lievito-madre'
  | 'licoli'
  | 'custom'

export type Leavening = 'yeast' | 'sourdough'

export interface PrefermentSpec {
  id: string
  type: PrefermentType
  /** Optional custom label, e.g. "Cold biga". */
  name: string
  /** Share of the recipe's TOTAL flour that goes into this preferment (%). */
  flourPct: number
  /** Water as % of this preferment's flour. */
  hydration: number
  leavening: Leavening
  /** 'auto' derives the yeast / starter amount from the phases; 'manual' uses the given value. */
  amountMode: 'auto' | 'manual'
  /**
   * Manual amount. Yeast: % of preferment flour in the recipe's yeast type.
   * Sourdough: ripe starter (seed) as % of the preferment's flour.
   */
  manualPct: number
  /** Salt as % of preferment flour (some bakers add a pinch to long bigas/poolish). */
  saltPct: number
  /** Honey (or malt) as % of preferment flour — a common poolish addition. */
  honeyPct: number
  /** Hydration of the seed starter used to build a sourdough preferment (%). */
  seedHydration: number
  phases: Phase[]
  /** Desired temperature at the end of mixing. */
  targetTempC: number
  /** Live: dough temperature measured right after mixing (replaces the forecast). */
  measuredMixC?: number | null
  /** Live: how much faster (>1) or slower (<1) this stage ferments than the model, from a rise reading. */
  activity?: number
}

export type SizingMode = 'balls' | 'pans'
export type PanShape = 'rect' | 'round'

export interface Sizing {
  mode: SizingMode
  /** balls: number of balls; pans: number of pans */
  count: number
  ballWeight: number
  panShape: PanShape
  panWidthCm: number
  panLengthCm: number
  panDiameterCm: number
  /** Dough weight per pan area in g/cm². */
  thicknessFactor: number
}

export interface FinalDoughSpec {
  phases: Phase[]
  /** 'auto' tops up leavening so the final dough is ready exactly at the end of its phases. */
  extraYeastMode: 'auto' | 'none' | 'manual'
  /** Manual extra yeast, % of total flour in the recipe's yeast type. */
  extraYeastPct: number
  /** Bassinage: % of the final-dough water held back and added late in the mix. */
  reservePct: number
  /** Duration of mixing + resting before bulk starts (minutes). */
  mixMinutes: number
  /**
   * How far to ferment relative to Craig's end point (≈ doubled). 1 = standard; pan styles that
   * proof until very puffy use ~1.3–1.5; "young" doughs 0.8–0.9.
   */
  proofTarget: number
  /** Live: dough temperature measured right after mixing (replaces the forecast). */
  measuredMixC?: number | null
  /** Live: how much faster (>1) or slower (<1) the dough ferments than the model, from a rise reading. */
  activity?: number
}

/** What actually happened while making the dough. */
export interface LiveLog {
  /** Stage id → when it was actually mixed (epoch ms). Mixed stages have their amounts locked. */
  mixed: Record<string, number>
  /** Sample-jar readings of the final dough. */
  rises: { at: number; risePct: number }[]
}

export interface KitchenSpec {
  roomC: number
  /** null = assume flour is at room temperature. */
  flourC: number | null
  /** The coldest water you can pour from the tap/fridge before resorting to ice. */
  tapC: number
  fridgeC: number
  mixerId: string
  /** null = use the mixer preset's typical temperature rise. */
  mixerRiseC: number | null
  targetFdtC: number
  /**
   * Room temperature at night (coolest, around 3 am). null = the room stays at roomC; otherwise
   * roomC is the warmest (mid-afternoon) value and the model follows a daily cycle.
   */
  nightC: number | null
}

export interface Recipe {
  id: string
  name: string
  styleId: string
  ovenId: string
  flourId: string
  createdAt: number
  updatedAt: number
  sizing: Sizing
  /** Extra dough to cover bowl/bench losses (%). */
  wastePct: number
  hydration: number
  saltPct: number
  oilPct: number
  sugarPct: number
  /** Diastatic malt (%). */
  maltPct: number
  yeastType: YeastType
  method: 'direct' | 'indirect'
  /** Direct method leavening. */
  directLeavening: Leavening
  /** Direct sourdough: ripe starter weight as % of total flour ('auto' derives it from the schedule). */
  starterMode: 'auto' | 'manual'
  starterPct: number
  starterHydration: number
  preferments: PrefermentSpec[]
  final: FinalDoughSpec
  kitchen: KitchenSpec
  /** ISO timestamp of when the pizzas should go in the oven. */
  bakeAt: string | null
  notes: string
  /** Live tracking of a dough in progress. */
  live?: LiveLog
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export type Severity = 'info' | 'tip' | 'warn' | 'error'

export interface Advice {
  severity: Severity
  title: string
  detail?: string
  /** Which stage the advice belongs to (preferment id, 'final' or 'recipe'). */
  scope: string
}

export type IngredientKind =
  | 'flour'
  | 'water'
  | 'ice'
  | 'salt'
  | 'yeast'
  | 'starter'
  | 'oil'
  | 'sugar'
  | 'malt'
  | 'honey'
  | 'preferment'

export interface IngredientLine {
  key: string
  kind: IngredientKind
  label: string
  grams: number
  /** Baker's percentage relative to the stage's reference flour. */
  pct?: number
  note?: string
}

export interface ResolvedPhase extends Phase {
  /** Environment temperature of the phase. */
  tempC: number
  /** Hours relative to bake time (negative = before baking). */
  startH: number
  endH: number
  /** Share of this stage's fermentation achieved in this phase (0–1+). */
  progress: number
  /** Mean dough temperature during the phase (thermal lag included). */
  meanDoughC: number
  /** Dough temperature at the end of the phase. */
  endDoughC: number
}

export interface WaterPlan {
  /** Target dough temperature at the end of mixing. */
  targetC: number
  /** Water temperature that hits the target exactly (may be unrealistic). */
  idealWaterC: number
  /** Temperature for the liquid water you pour. */
  waterC: number
  /** Ice replacing part of the water (g). */
  iceG: number
  liquidG: number
  /** Dough temperature you will actually get. */
  expectedC: number
  status: 'ok' | 'ice' | 'too-cold' | 'too-hot'
  /** When 'too-cold': flour temperature that would still hit the target. */
  flourNeededC?: number
  mixerRiseC: number
  /** Classic bakers' DDT rule for comparison. */
  classicWaterC: number
}

export interface LeaveningResult {
  kind: 'yeast' | 'sourdough' | 'none'
  /** Fresh-yeast equivalent % of this stage's reference flour (yeast). */
  freshPct: number
  /** % in the recipe's yeast type. */
  typePct: number
  /** Grams in the recipe's yeast type (or ripe starter grams for sourdough). */
  grams: number
  /** Sourdough: seed/starter % (see stage for basis). */
  starterPct: number
  /** Whether the amount was computed ('auto') or entered ('manual'). */
  mode: 'auto' | 'manual' | 'none'
}

export interface StageResult {
  id: string
  kind: 'preferment' | 'final'
  type?: PrefermentType
  title: string
  subtitle: string
  ingredients: IngredientLine[]
  totalWeight: number
  flour: number
  water: number
  hydration: number
  leavening: LeaveningResult
  phases: ResolvedPhase[]
  /** Hours relative to bake time. */
  startH: number
  endH: number
  totalHours: number
  /** 1 = ripe exactly at the end of the plan; <1 under-, >1 over-fermented. */
  ripeness: number
  /** Temperature of the dough right after mixing. */
  mixTempC: number
  /** Temperature of the dough when this stage ends (thermal model). */
  endTempC: number
  waterPlan: WaterPlan | null
  /** Equivalent hours at 20 °C (fermentation load). */
  equivalentHours20: number
  /** Raw fermentation clocks over the stage: yeast hours at 21 °C and sourdough doublings (model speed). */
  clocks: { eqHours21: number; sdDoublings: number }
  /** Simulated dough temperature over this stage (hours relative to bake). */
  curve: CurvePoint[]
}

export interface Totals {
  flour: number
  water: number
  salt: number
  oil: number
  sugar: number
  malt: number
  honey: number
  /** Commercial yeast in the recipe's yeast type. */
  yeast: number
  yeastFreshEq: number
  starter: number
  dough: number
  prefermentedFlourPct: number
}

export type TimelineKind =
  | 'feed'
  | 'build'
  | 'move'
  | 'mix'
  | 'ball'
  | 'temper'
  | 'preheat'
  | 'bake'

export interface TimelineEvent {
  id: string
  kind: TimelineKind
  /** Hours relative to bake time (negative = before). */
  atH: number
  /** Duration of the action itself in minutes (for calendar export). */
  durationMin: number
  title: string
  detail: string
  stageId: string
  tempC?: number
  location?: PhaseLocation
}

export interface CurvePoint {
  /** Hours relative to bake time. */
  t: number
  doughC: number
  envC: number
  /** Share of the stage's planned end point reached so far (1 = ripe as planned). */
  ripeness: number
}

/** When the final dough bakes well (hours relative to the planned bake). null = outside the modelled range. */
export interface BakeWindow {
  /** Ripe enough to bake. */
  readyH: number | null
  /** Exactly at the planned end point. */
  bestH: number | null
  /** Past its best (starts to over-proof). */
  untilH: number | null
  /** What happens if the dough waits past the planned bake in its last spot. */
  after: CurvePoint[]
}

export interface RecipeResult {
  totals: Totals
  stages: StageResult[]
  timeline: TimelineEvent[]
  advice: Advice[]
  /** Hours from the first action to baking. */
  totalHours: number
  /** Equivalent fermentation hours at 20 °C seen by the flour (drives flour-strength advice). */
  fermentationLoad20: number
  recommendedW: { min: number; max: number }
  pieceWeight: number
  pieces: number
  /** Final dough temperature curve (thermal model). */
  curve: CurvePoint[]
  window: BakeWindow
}
