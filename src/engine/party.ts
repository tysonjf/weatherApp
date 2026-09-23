/**
 * Pizza night: how many pizzas, what goes on them, what to buy, and how the service runs.
 *
 * Toppings: AVPN (60–80 g tomato, 80–100 g fior di latte per Neapolitan), US pizzeria portion guides
 * (Burke: ≈0.15 g/cm² sauce, ≈0.2 g/cm² cheese at a medium load), Detroit and pan recipes (≈340 g brick
 * cheese per 10×14″ pan, ≈170 g per 10″ skillet). Oven cadences are typical home-cook values.
 */
import type { Appetite, PartySpec, Recipe, RecipeResult } from './types'
import { computeRecipe, type ComputeOptions } from './compute'
import { panArea } from './composition'

export const DEFAULT_PARTY: PartySpec = { adults: 4, kids: 0, appetite: 'normal', cadenceMin: null, spare: true }

/* ------------------------------------------------------------------ */
/* Ovens in service                                                    */
/* ------------------------------------------------------------------ */

export interface OvenService {
  /** Typical bake time (seconds). */
  bakeSec: number
  /** Turn the pizza every … seconds (0 = no turning, just once halfway). */
  turnEverySec: number
  /** Minutes from one pizza to the next (stretch, top, bake, recover). */
  cadenceMin: number
  /** Pizzas or pans in the oven at once. */
  capacity: number
}

export const OVEN_SERVICE: Record<string, OvenService> = {
  wood: { bakeSec: 90, turnEverySec: 20, cadenceMin: 3, capacity: 1 },
  portable: { bakeSec: 90, turnEverySec: 20, cadenceMin: 4, capacity: 1 },
  'electric-hot': { bakeSec: 150, turnEverySec: 45, cadenceMin: 6, capacity: 1 },
  'home-steel': { bakeSec: 420, turnEverySec: 0, cadenceMin: 12, capacity: 1 },
  'home-stone': { bakeSec: 540, turnEverySec: 0, cadenceMin: 15, capacity: 1 },
  'home-pan': { bakeSec: 900, turnEverySec: 0, cadenceMin: 18, capacity: 2 },
  deck: { bakeSec: 420, turnEverySec: 0, cadenceMin: 8, capacity: 2 },
  fryer: { bakeSec: 150, turnEverySec: 60, cadenceMin: 4, capacity: 2 },
}
export const ovenService = (ovenId: string): OvenService => OVEN_SERVICE[ovenId] ?? OVEN_SERVICE['home-steel']

/* ------------------------------------------------------------------ */
/* Portions                                                            */
/* ------------------------------------------------------------------ */

/** Dough an adult with a normal appetite eats, by style (g). One Neapolitan pizza ≈ 250 g. */
export const DOUGH_PER_ADULT: Record<string, number> = {
  neapolitan: 250,
  canotto: 270,
  roman: 180,
  pinsa: 250,
  ny: 200,
  tavern: 150,
  detroit: 200,
  sicilian: 220,
  pan: 210,
  teglia: 200,
  focaccia: 120,
  custom: 250,
  'new-haven': 220,
  'deep-dish': 250,
  'bar-pie': 185,
  'quad-cities': 200,
  calzone: 280,
  fritta: 150,
  genovese: 120,
  pala: 200,
  cracker: 140,
  greek: 220,
  california: 165,
}
const APPETITE: Record<Appetite, number> = { light: 0.75, normal: 1, hungry: 1.35 }
/** Styles where everyone gets their own pizza. */
const PERSONAL = new Set(['neapolitan', 'canotto', 'roman', 'pinsa', 'custom', 'calzone', 'fritta', 'california'])

/** Balls or pans to make for a party. */
export function piecesFor(r: Recipe, pieceWeightG: number, party: PartySpec): number {
  const people = party.adults + 0.5 * party.kids
  if (people <= 0) return 0
  const personal = PERSONAL.has(r.styleId) && r.sizing.mode === 'balls'
  let n: number
  if (personal) n = Math.ceil(party.adults * APPETITE[party.appetite] + party.kids * 0.5 * APPETITE[party.appetite] - 0.2)
  else {
    const perAdult = (DOUGH_PER_ADULT[r.styleId] ?? 220) * APPETITE[party.appetite]
    n = Math.ceil((people * perAdult) / Math.max(50, pieceWeightG) - 0.15)
  }
  return Math.max(1, n + (party.spare && r.sizing.mode === 'balls' ? 1 : 0))
}

/* ------------------------------------------------------------------ */
/* Toppings                                                            */
/* ------------------------------------------------------------------ */

export interface ToppingLine {
  key: string
  name: string
  grams: number
  /** Countable things (basil leaves) instead of grams. */
  count?: number
  kind: 'sauce' | 'cheese' | 'oil' | 'other'
}

interface Profile {
  /** 'piece': amounts per reference ball; 'area': amounts per cm². */
  basis: 'piece' | 'area'
  refG?: number
  /** Dough per area for ball styles measured by area (g/cm²), to get the pizza size. */
  doughPerCm2?: number
  sauce: number
  cheese: number
  cheeseName: string
  oil: number
  extras: { key: string; name: string; amount: number; count?: boolean }[]
  sauceName: string
  sauceRecipe: string
}

const NEAPOLITAN_SAUCE =
  'Peeled plum tomatoes (San Marzano if you can), crushed by hand or passed through a food mill — never blended. About 1.5 % salt, nothing else; it cooks on the pizza.'
const NY_SAUCE = 'Crushed tomatoes with about 1 % salt, a pinch of sugar, dried oregano and a little garlic and olive oil. Uncooked, or simmered 15–20 min for a sweeter sauce.'
const PAN_SAUCE = 'A thick cooked sauce: crushed tomatoes simmered 20–30 min with garlic, oregano, a pinch of sugar and salt to taste.'

const TOMATO_PIE = 'Crushed tomatoes with a little salt, oregano and olive oil; grated Pecorino on top. Mozzarella (“mootz”) is an extra.'

export const TOPPING_PROFILES: Record<string, Profile> = {
  'new-haven': {
    basis: 'area',
    doughPerCm2: 0.34,
    sauce: 0.13,
    cheese: 0.08,
    cheeseName: 'Mozzarella (“mootz”, optional)',
    oil: 0.01,
    extras: [{ key: 'pecorino', name: 'Grated Pecorino Romano', amount: 0.012 }],
    sauceName: 'Tomato pie sauce',
    sauceRecipe: TOMATO_PIE,
  },
  'deep-dish': {
    basis: 'area',
    sauce: 0.45,
    cheese: 0.45,
    cheeseName: 'Sliced low-moisture mozzarella',
    oil: 0,
    extras: [
      { key: 'parm', name: 'Grated Parmesan', amount: 0.02 },
      { key: 'sausage', name: 'Italian sausage (optional)', amount: 0.25 },
    ],
    sauceName: 'Chunky tomato sauce',
    sauceRecipe: 'Crushed or hand-crushed whole tomatoes, drained a little, with salt, oregano, basil and garlic — thick, barely cooked; it goes on top.',
  },
  'bar-pie': {
    basis: 'area',
    sauce: 0.12,
    cheese: 0.3,
    cheeseName: 'Sharp cheddar & mozzarella, shredded',
    oil: 0.02,
    extras: [],
    sauceName: 'Sauce',
    sauceRecipe: NY_SAUCE,
  },
  'quad-cities': {
    basis: 'area',
    doughPerCm2: 0.4,
    sauce: 0.14,
    cheese: 0.2,
    cheeseName: 'Low-moisture mozzarella, shredded',
    oil: 0,
    extras: [{ key: 'sausage', name: 'Lean fennel sausage', amount: 0.12 }],
    sauceName: 'Spicy sauce',
    sauceRecipe: 'Smooth tomato sauce with plenty of red pepper flakes, cayenne and a little sugar.',
  },
  calzone: {
    basis: 'piece',
    refG: 280,
    sauce: 20,
    cheese: 60,
    cheeseName: 'Fior di latte, diced and drained',
    oil: 5,
    extras: [
      { key: 'ricotta', name: 'Ricotta', amount: 120 },
      { key: 'salame', name: 'Salame Napoli, diced', amount: 40 },
    ],
    sauceName: 'Tomato (a spoonful on top)',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  fritta: {
    basis: 'piece',
    refG: 150,
    sauce: 20,
    cheese: 40,
    cheeseName: 'Provola (smoked), diced',
    oil: 0,
    extras: [
      { key: 'ricotta', name: 'Ricotta', amount: 70 },
      { key: 'cicoli', name: 'Cicoli or salame, chopped', amount: 30 },
    ],
    sauceName: 'Tomato',
    sauceRecipe: 'A little tomato inside; the filling is mostly ricotta, provola and cicoli. Fry in peanut or high-oleic sunflower oil.',
  },
  genovese: {
    basis: 'area',
    sauce: 0,
    cheese: 0,
    cheeseName: '',
    oil: 0.07,
    extras: [{ key: 'flaky', name: 'Coarse salt for the top', amount: 0.004 }],
    sauceName: '',
    sauceRecipe: 'Salamoia: equal parts water and olive oil with a pinch of salt, whisked and poured into the dimples just before the last proof.',
  },
  pala: {
    basis: 'area',
    doughPerCm2: 0.3,
    sauce: 0.12,
    cheese: 0.1,
    cheeseName: 'Mozzarella, drained',
    oil: 0.02,
    extras: [],
    sauceName: 'Tomatoes',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  cracker: {
    basis: 'area',
    doughPerCm2: 0.25,
    sauce: 0.1,
    cheese: 0.16,
    cheeseName: 'Low-moisture mozzarella, shredded',
    oil: 0,
    extras: [],
    sauceName: 'Pizza sauce',
    sauceRecipe: NY_SAUCE,
  },
  greek: {
    basis: 'area',
    sauce: 0.2,
    cheese: 0.3,
    cheeseName: 'Mozzarella & cheddar blend',
    oil: 0.03,
    extras: [{ key: 'oregano', name: 'Dried oregano', amount: 0.002 }],
    sauceName: 'Sauce',
    sauceRecipe: 'Tomato paste thinned with water, seasoned with oregano, garlic and a little sugar — thick and tangy.',
  },
  california: {
    basis: 'piece',
    refG: 165,
    sauce: 40,
    cheese: 60,
    cheeseName: 'Mozzarella (or goat cheese, fontina…)',
    oil: 5,
    extras: [],
    sauceName: 'Sauce (or pesto, or none)',
    sauceRecipe: 'Anything goes: a light tomato sauce, pesto or just garlic oil under seasonal toppings.',
  },
  neapolitan: {
    basis: 'piece',
    refG: 250,
    sauce: 70,
    cheese: 90,
    cheeseName: 'Fior di latte (or buffalo mozzarella), drained',
    oil: 5,
    extras: [{ key: 'basil', name: 'Basil leaves', amount: 4, count: true }],
    sauceName: 'Tomatoes',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  canotto: {
    basis: 'piece',
    refG: 270,
    sauce: 75,
    cheese: 100,
    cheeseName: 'Fior di latte, drained',
    oil: 5,
    extras: [{ key: 'basil', name: 'Basil leaves', amount: 4, count: true }],
    sauceName: 'Tomatoes',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  roman: {
    basis: 'piece',
    refG: 180,
    sauce: 70,
    cheese: 90,
    cheeseName: 'Mozzarella (fior di latte), well drained',
    oil: 6,
    extras: [],
    sauceName: 'Tomatoes',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  pinsa: {
    basis: 'piece',
    refG: 250,
    sauce: 70,
    cheese: 90,
    cheeseName: 'Mozzarella, drained',
    oil: 6,
    extras: [],
    sauceName: 'Tomatoes',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  custom: {
    basis: 'piece',
    refG: 250,
    sauce: 70,
    cheese: 90,
    cheeseName: 'Mozzarella',
    oil: 5,
    extras: [],
    sauceName: 'Tomato sauce',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  ny: {
    basis: 'area',
    doughPerCm2: 0.395,
    sauce: 0.15,
    cheese: 0.2,
    cheeseName: 'Low-moisture whole-milk mozzarella, shredded',
    oil: 0,
    extras: [{ key: 'parm', name: 'Grated Parmesan / Pecorino', amount: 0.01 }],
    sauceName: 'NY sauce',
    sauceRecipe: NY_SAUCE,
  },
  tavern: {
    basis: 'area',
    doughPerCm2: 0.295,
    sauce: 0.12,
    cheese: 0.18,
    cheeseName: 'Low-moisture mozzarella, shredded',
    oil: 0,
    extras: [{ key: 'sausage', name: 'Fennel sausage (optional)', amount: 0.08 }],
    sauceName: 'Pizza sauce',
    sauceRecipe: NY_SAUCE,
  },
  detroit: {
    basis: 'area',
    sauce: 0.23,
    cheese: 0.38,
    cheeseName: 'Wisconsin brick cheese (or half Monterey Jack, half mozzarella), cubed',
    oil: 0.02,
    extras: [{ key: 'pepperoni', name: 'Pepperoni (optional)', amount: 0.07 }],
    sauceName: 'Cooked sauce (in stripes on top)',
    sauceRecipe: PAN_SAUCE,
  },
  sicilian: {
    basis: 'area',
    sauce: 0.2,
    cheese: 0.2,
    cheeseName: 'Low-moisture mozzarella',
    oil: 0.03,
    extras: [{ key: 'pecorino', name: 'Grated Pecorino', amount: 0.015 }],
    sauceName: 'Sauce',
    sauceRecipe: PAN_SAUCE,
  },
  pan: {
    basis: 'area',
    sauce: 0.3,
    cheese: 0.33,
    cheeseName: 'Low-moisture mozzarella, shredded',
    oil: 0.05,
    extras: [{ key: 'pepperoni', name: 'Pepperoni (optional)', amount: 0.08 }],
    sauceName: 'Sauce',
    sauceRecipe: PAN_SAUCE,
  },
  teglia: {
    basis: 'area',
    sauce: 0.2,
    cheese: 0.12,
    cheeseName: 'Mozzarella',
    oil: 0.03,
    extras: [],
    sauceName: 'Tomatoes',
    sauceRecipe: NEAPOLITAN_SAUCE,
  },
  focaccia: {
    basis: 'area',
    sauce: 0,
    cheese: 0,
    cheeseName: '',
    oil: 0.06,
    extras: [
      { key: 'flaky', name: 'Flaky sea salt', amount: 0.004 },
      { key: 'rosemary', name: 'Rosemary sprigs', amount: 0.003, count: true },
    ],
    sauceName: '',
    sauceRecipe: 'Pour plenty of olive oil in the pan and over the dimpled dough; finish with flaky salt (focaccia genovese: brush with a 1 : 1 water–oil brine).',
  },
}

export const toppingProfile = (styleId: string): Profile => TOPPING_PROFILES[styleId] ?? TOPPING_PROFILES.custom

/** Area of one pizza (cm²). */
export function pizzaArea(r: Recipe, pieceWeightG: number): number {
  if (r.sizing.mode === 'pans') return panArea(r)
  const p = toppingProfile(r.styleId)
  const perCm2 = p.doughPerCm2 ?? 0.33
  return pieceWeightG / perCm2
}

/** Toppings for one pizza. */
export function toppingsPerPizza(r: Recipe, pieceWeightG: number): ToppingLine[] {
  const p = toppingProfile(r.styleId)
  const f = p.basis === 'piece' ? pieceWeightG / (p.refG ?? 250) : pizzaArea(r, pieceWeightG)
  const out: ToppingLine[] = []
  if (p.sauce > 0) out.push({ key: 'sauce', name: p.sauceName, grams: p.sauce * f, kind: 'sauce' })
  if (p.cheese > 0) out.push({ key: 'cheese', name: p.cheeseName, grams: p.cheese * f, kind: 'cheese' })
  if (p.oil > 0) out.push({ key: 'oil', name: 'Extra-virgin olive oil', grams: p.oil * f, kind: 'oil' })
  for (const x of p.extras)
    out.push(x.count ? { key: x.key, name: x.name, grams: 0, count: Math.max(1, Math.round(x.amount * f)), kind: 'other' } : { key: x.key, name: x.name, grams: x.amount * f, kind: 'other' })
  return out
}

/** Pack sizes to buy (grams per pack). */
const PACKS: Record<string, { size: number; label: string }> = {
  sauce: { size: 400, label: '400 g can' },
  mozz: { size: 125, label: '125 g ball' },
  block: { size: 454, label: '1 lb block' },
}

export interface ShoppingLine {
  key: string
  name: string
  amount: string
  grams: number
}

/** Everything to buy for the dough and toppings. */
export function shoppingList(
  r: Recipe,
  res: RecipeResult,
  pizzas: number,
  fmtWeight: (g: number) => string,
  yeastName: string,
): ShoppingLine[] {
  const t = res.totals
  const lines: ShoppingLine[] = [{ key: 'flour', name: 'Flour', amount: fmtWeight(t.flour), grams: t.flour }]
  if (t.salt > 0) lines.push({ key: 'salt', name: 'Fine salt', amount: fmtWeight(t.salt), grams: t.salt })
  if (t.yeast > 0) lines.push({ key: 'yeast', name: yeastName, amount: fmtWeight(t.yeast), grams: t.yeast })
  if (t.starter > 0) lines.push({ key: 'starter', name: 'Ripe starter', amount: fmtWeight(t.starter), grams: t.starter })
  if (t.oil > 0) lines.push({ key: 'dough-oil', name: 'Olive oil (dough)', amount: fmtWeight(t.oil), grams: t.oil })
  if (t.sugar > 0) lines.push({ key: 'sugar', name: 'Sugar', amount: fmtWeight(t.sugar), grams: t.sugar })
  if (t.malt > 0) lines.push({ key: 'malt', name: 'Diastatic malt', amount: fmtWeight(t.malt), grams: t.malt })
  for (const x of toppingsPerPizza(r, res.pieceWeight)) {
    if (x.count !== undefined) {
      lines.push({ key: x.key, name: x.name, amount: `${x.count * pizzas}`, grams: 0 })
      continue
    }
    const g = x.grams * pizzas
    let amount = fmtWeight(g)
    if (x.kind === 'sauce') amount += ` · ${Math.ceil(g / PACKS.sauce.size)} × ${PACKS.sauce.label}`
    if (x.kind === 'cheese') {
      const pack = /fior di latte|buffalo|mozzarella, drained|drained/i.test(x.name) ? PACKS.mozz : PACKS.block
      amount += ` · ${Math.ceil(g / pack.size)} × ${pack.label}`
    }
    lines.push({ key: x.key, name: x.name, amount, grams: g })
  }
  return lines
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export interface ServicePlan {
  /** When each pizza goes in (epoch ms). */
  bakes: number[]
  endMs: number
  /** Balls to take out of the fridge, in waves (empty when the balls aren't in the fridge). */
  waves: { atMs: number; count: number }[]
  /** Warm-up time the plan gives each ball (h), when taking balls out of the fridge. */
  temperH: number
  /** Ripeness of the first and the last pizza at the moment it bakes. */
  firstRipeness: number
  lastRipeness: number
}

const H = 3600000

/**
 * The service: pizzas go in every `cadenceMin` from the bake time. Balls that warm up out of the
 * fridge are taken out in waves so each gets the same warm-up; otherwise later pizzas are simply older.
 */
export function servicePlan(
  r: Recipe,
  res: RecipeResult,
  bakeMs: number,
  pizzas: number,
  cadenceMin: number,
  capacity: number,
  opts: Omit<ComputeOptions, 'bakeAtMs'>,
): ServicePlan {
  const n = Math.max(1, pizzas)
  const bakes = Array.from({ length: n }, (_, k) => bakeMs + Math.floor(k / Math.max(1, capacity)) * cadenceMin * 60000)
  const last = bakes[bakes.length - 1]
  const phases = r.final.phases.filter((p) => p.hours > 0)
  const lastPhase = phases[phases.length - 1]
  const prev = phases[phases.length - 2]
  const fromFridge = !!lastPhase && lastPhase.location !== 'fridge' && prev?.location === 'fridge'
  const final = res.stages.find((s) => s.id === 'final')!
  let lastRipeness: number
  const waves: { atMs: number; count: number }[] = []
  if (fromFridge) {
    // Every ball gets the planned warm-up; later ones simply stay in the fridge longer.
    const lead = lastPhase.hours * H
    const slot = 30 * 60000
    const firstOut = bakes[0] - lead
    for (const b of bakes) {
      const out = firstOut + Math.floor((b - lead - firstOut) / slot) * slot
      const w = waves.find((x) => x.atMs === out)
      if (w) w.count++
      else waves.push({ atMs: out, count: 1 })
    }
    const extraH = (last - bakeMs) / H
    if (extraH > 0.01 && prev) {
      const idx = r.final.phases.lastIndexOf(prev)
      const longer: Recipe = {
        ...r,
        bakeAt: new Date(last).toISOString(),
        final: { ...r.final, phases: r.final.phases.map((p, i) => (i === idx ? { ...p, hours: p.hours + extraH } : p)) },
      }
      // Same yeast as the real dough: lock it.
      const locked: Recipe =
        longer.method === 'direct' && longer.directLeavening === 'sourdough'
          ? { ...longer, starterMode: 'manual', starterPct: final.leavening.starterPct }
          : { ...longer, final: { ...longer.final, extraYeastMode: 'manual', extraYeastPct: final.leavening.typePct } }
      lastRipeness = computeRecipe(locked, { ...opts, bakeAtMs: last }).stages.find((s) => s.id === 'final')!.ripeness
    } else lastRipeness = final.ripeness
  } else {
    const t = (last - bakeMs) / H
    const after = res.window.after
    let rr = after[after.length - 1]?.ripeness ?? final.ripeness
    for (let i = 1; i < after.length; i++)
      if (after[i].t >= t) {
        const a = after[i - 1]
        const b = after[i]
        rr = a.ripeness + ((t - a.t) / Math.max(1e-9, b.t - a.t)) * (b.ripeness - a.ripeness)
        break
      }
    lastRipeness = rr
  }
  return {
    bakes,
    endMs: last + cadenceMin * 60000,
    waves,
    temperH: fromFridge ? lastPhase.hours : 0,
    firstRipeness: final.ripeness,
    lastRipeness,
  }
}
