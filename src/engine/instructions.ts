import type { Recipe, RecipeResult, StageResult } from './types'
import { mixerById } from './mixers'
import { ovenById, prefermentPreset, styleById } from './presets'
import { formatHours, formatTemp, formatWeight, localizeTemps, type TempUnit, type WeightUnit } from './units'
import { YEAST_LABEL } from './yeastTypes'

export interface GuideStep {
  key: string
  stageId: string
  title: string
  /** Hours relative to bake time, if the step happens at a specific moment. */
  atH?: number
  body: string[]
}

interface Ctx {
  r: Recipe
  res: RecipeResult
  t: (c: number, d?: number) => string
  w: (g: number) => string
}

const ing = (s: StageResult, key: string) => s.ingredients.find((l) => l.key === key)

function phaseSummary(ctx: Ctx, s: StageResult): string {
  return s.phases
    .filter((p) => !p.temper)
    .map((p) =>
      p.location === 'fridge'
        ? `${formatHours(p.hours)} in the fridge (${ctx.t(p.tempC, 0)})`
        : p.location === 'room'
          ? `${formatHours(p.hours)} at room temperature (${ctx.t(p.tempC, 0)})`
          : `${formatHours(p.hours)} at ${ctx.t(p.tempC, 0)}`,
    )
    .join(', then ')
}

function waterLine(ctx: Ctx, s: StageResult, grams: number): string {
  const w = s.waterPlan
  if (!w || !Number.isFinite(w.waterC)) return `${ctx.w(grams)} water`
  if (w.iceG > 0.5) return `${ctx.w(w.liquidG)} water at ${ctx.t(w.waterC)} plus ${ctx.w(w.iceG)} crushed ice`
  return `${ctx.w(grams)} water at ${ctx.t(w.waterC)}`
}

function yeastHandling(r: Recipe, iced: boolean): string {
  if (r.yeastType === 'instant')
    return iced ? 'Mix the instant yeast into the flour (not into icy water).' : 'Mix the instant yeast into the flour or dissolve it in the water.'
  if (r.yeastType === 'active-dry') return 'Dissolve the active dry yeast in a little of the water (lukewarm if possible) for 5–10 minutes first.'
  return 'Crumble the fresh yeast into the water and stir to dissolve.'
}

function prefermentSteps(ctx: Ctx, s: StageResult): GuideStep[] {
  const { r } = ctx
  const spec = r.preferments.find((p) => p.id === s.id)!
  const preset = prefermentPreset(spec.type)
  const flour = ing(s, 'flour')!.grams
  const waterG = ing(s, 'water')?.grams ?? 0
  const iced = (s.waterPlan?.iceG ?? 0) > 0.5
  const steps: GuideStep[] = []
  const name = spec.name.toLowerCase()

  if (spec.leavening === 'sourdough') {
    const seed = ing(s, 'seed')!
    steps.push({
      key: `${s.id}-mix`,
      stageId: s.id,
      title: `Build the ${name}`,
      atH: s.startH,
      body: [
        `Use ripe, bubbly starter at its peak: ${ctx.w(seed.grams)} (${seed.note ?? ''}).`,
        `Mix it with ${waterLine(ctx, s, waterG)}, then add ${ctx.w(flour)} flour and mix until no dry flour remains.`,
        spec.hydration < 75
          ? 'Knead briefly into a smooth, firm ball; score a cross on top and place it in a tall jar.'
          : 'Stir into a thick, smooth batter and mark the level on the jar with a rubber band.',
        `Let it ferment ${phaseSummary(ctx, s)}.`,
      ],
    })
    steps.push({
      key: `${s.id}-ripe`,
      stageId: s.id,
      title: `Check the ${name} is at peak`,
      atH: s.endH,
      body: [
        spec.hydration < 75 ? 'Roughly tripled, domed, with a pleasantly acidic, yogurty smell.' : 'At least doubled, domed and full of bubbles; a spoonful floats in water.',
        'If it has collapsed and smells sharp or of acetone it is past peak — use it anyway but expect a faster, sourer dough.',
      ],
    })
    return steps
  }

  const yeast = ing(s, 'yeast')!
  const honey = ing(s, 'honey')
  const salt = ing(s, 'salt')
  const mixer = mixerById(r.kitchen.mixerId)
  const byHand = mixer.id === 'hand'
  const body: string[] = []
  if (spec.type === 'biga') {
    body.push(`Weigh ${ctx.w(flour)} strong flour, ${waterLine(ctx, s, waterG)} and ${ctx.w(yeast.grams)} ${YEAST_LABEL[r.yeastType].toLowerCase()}.`)
    body.push(yeastHandling(r, iced))
    if (salt) body.push(`Add ${ctx.w(salt.grams)} salt to slow it down in the heat.`)
    body.push(
      byHand
        ? 'Pour in all the water and toss with your fingertips for 1–2 minutes, just until no dry flour is left.'
        : 'Mix on the lowest speed for 2–4 minutes, just until no dry flour is left.',
    )
    body.push('Stop there: it should look like wet gravel — hazelnut-sized crumbs, not a smooth dough.')
    body.push(`It should be about ${ctx.t(spec.targetTempC, 0)} when you finish.`)
    body.push('Pile it loosely (don’t press) into a tall, narrow container; cover with film pierced with a few holes.')
  } else if (spec.type === 'poolish') {
    body.push(`${yeastHandling(r, iced)} Use ${waterLine(ctx, s, waterG)} and ${ctx.w(yeast.grams)} ${YEAST_LABEL[r.yeastType].toLowerCase()}${honey ? ` with ${ctx.w(honey.grams)} honey` : ''}.`)
    if (salt) body.push(`Stir in ${ctx.w(salt.grams)} salt.`)
    body.push(`Whisk in ${ctx.w(flour)} flour until smooth and lump-free (1–2 minutes).`)
    body.push('Pour into a container with room to triple and cover loosely.')
  } else {
    body.push(`Combine ${ctx.w(flour)} flour, ${waterLine(ctx, s, waterG)} and ${ctx.w(yeast.grams)} ${YEAST_LABEL[r.yeastType].toLowerCase()}${salt ? ` and ${ctx.w(salt.grams)} salt` : ''}.`)
    body.push(yeastHandling(r, iced))
    body.push(spec.type === 'pate-fermentee' ? 'Knead into a smooth dough, like a small batch of bread dough.' : 'Mix until evenly hydrated — a short mix is enough.')
    body.push('Cover and set aside.')
  }
  body.push(`Ferment ${phaseSummary(ctx, s)}.`)
  steps.push({ key: `${s.id}-mix`, stageId: s.id, title: `Mix the ${name}`, atH: s.startH, body })

  const ripe: string[] =
    spec.type === 'biga'
      ? [
          'Grown noticeably, with a smooth, puffy (not wrinkled) top; spongy inside with fine holes when torn.',
          'Smells sweet and lightly alcoholic with yogurt or hazelnut notes. Vinegar or solvent = over-ripe.',
        ]
      : spec.type === 'poolish'
        ? [
            'At least doubled, domed and covered in bubbles; best when the dome just starts to relax and leaves a ring on the container.',
            'Collapsed, watery and sharp-smelling means it went too far.',
          ]
        : ['Visibly risen and domed, soft and full of small bubbles.']
  const rest = s.phases.find((p) => p.temper)
  if (rest) {
    const cold = s.phases[s.phases.indexOf(rest) - 1]
    const from = cold?.location === 'fridge' ? 'fridge' : 'cold'
    const fw = ctx.res.stages.find((x) => x.id === 'final')?.waterPlan
    steps.push({
      key: `${s.id}-temper`,
      stageId: s.id,
      title: `Take the ${name} out of the ${from}`,
      atH: rest.startH,
      body: [
        `Leave it covered at room temperature for ${formatHours(rest.hours)} before you mix the final dough. It warms from about ${ctx.t(cold?.endDoughC ?? s.endTempC, 0)} to ${ctx.t(s.endTempC, 0)}.`,
        `That's what lets the final dough reach ${ctx.t(r.kitchen.targetFdtC, 0)} with water at ${fw && Number.isFinite(fw.waterC) ? ctx.t(fw.waterC) : 'a normal temperature'} instead of hot water.`,
        'It keeps fermenting while it warms; the plan already counts that. Don’t leave it out much longer.',
      ],
    })
  } else if (s.phases.at(-1)?.location === 'fridge')
    ripe.push(`It will come out cold (≈ ${ctx.t(s.endTempC, 0)}) — the final-dough water temperature already accounts for that.`)
  steps.push({ key: `${s.id}-ripe`, stageId: s.id, title: `Check the ${preset.name.toLowerCase()}`, atH: s.endH, body: ripe })
  return steps
}

function finalSteps(ctx: Ctx): GuideStep[] {
  const { r, res } = ctx
  const s = res.stages.find((x) => x.id === 'final')!
  const mixer = mixerById(r.kitchen.mixerId)
  const style = styleById(r.styleId)
  const oven = ovenById(r.ovenId)
  const steps: GuideStep[] = []
  const flour = ing(s, 'flour')
  const water = ing(s, 'water')
  const reserve = ing(s, 'reserve')
  const ice = ing(s, 'ice')
  const salt = ing(s, 'salt')
  const yeast = ing(s, 'yeast')
  const starter = ing(s, 'starter')
  const oil = ing(s, 'oil')
  const sugar = ing(s, 'sugar')
  const malt = ing(s, 'malt')
  const prefLines = s.ingredients.filter((l) => l.kind === 'preferment')
  const iced = !!ice
  const hydr = r.hydration
  const byHand = mixer.id === 'hand'
  const startH = s.startH

  const waterText = water
    ? iced
      ? `${ctx.w(water.grams)} water at ${ctx.t(s.waterPlan!.waterC)} plus ${ctx.w(ice!.grams)} crushed ice`
      : `${ctx.w(water.grams)} water at ${ctx.t(s.waterPlan?.waterC ?? r.kitchen.roomC)}`
    : 'no extra water'

  const autolyseMin = Math.max(0, r.final.autolyseMin ?? 0)
  if (autolyseMin > 0) {
    steps.push({
      key: 'final-autolyse',
      stageId: 'final',
      title: 'Autolyse',
      atH: startH - autolyseMin / 60,
      body: [
        `Mix ${flour ? ctx.w(flour.grams) : 'the'} flour with ${waterText}, holding back about 5 % of the water. Stir just until no dry flour is left.`,
        `Cover and rest ${autolyseMin} minutes. The flour hydrates and gluten starts forming on its own, so the dough needs less kneading and stretches more easily.`,
        `Salt, ${r.method === 'indirect' ? 'the preferments, ' : ''}${starter ? 'starter' : 'yeast'} and the held-back water go in at the next step.`,
      ],
    })
  }

  const mixBody: string[] = []
  if (autolyseMin > 0)
    mixBody.push('Everything below goes into the rested flour and water: squeeze it in by hand or mix on low speed until absorbed.')
  if (r.method === 'indirect') {
    mixBody.push(`Pour ${waterText} into the bowl.`)
    for (const p of prefLines) {
      const spec = r.preferments.find((x) => `pref-${x.id}` === p.key)
      if (spec?.type === 'biga') mixBody.push(`Tear the ${spec.name.toLowerCase()} (${ctx.w(p.grams)}) into walnut-sized pieces and add it.`)
      else mixBody.push(`Add the ${spec?.name.toLowerCase() ?? 'preferment'} (${ctx.w(p.grams)}).`)
    }
    if (yeast && yeast.grams > 0.001) mixBody.push(`Add ${ctx.w(yeast.grams)} ${YEAST_LABEL[r.yeastType].toLowerCase()}.`)
    if (sugar || malt) mixBody.push(`Add ${[sugar && `${ctx.w(sugar.grams)} sugar`, malt && `${ctx.w(malt.grams)} diastatic malt`].filter(Boolean).join(' and ')}.`)
    mixBody.push(
      byHand
        ? 'Squeeze everything through your fingers until the preferments break up into a loose slurry.'
        : 'Mix on first speed for 3–5 minutes until the preferments break down.',
    )
    if (flour) mixBody.push(`Add ${ctx.w(flour.grams)} flour gradually and mix until it just comes together.`)
    if (salt) mixBody.push(`Sprinkle in ${ctx.w(salt.grams)} salt${water ? '' : ' (dissolved in a splash of the held-back water if the dough is stiff)'}.`)
  } else {
    mixBody.push(`Pour ${waterText} into the bowl${salt ? ` and dissolve ${ctx.w(salt.grams)} salt in it` : ''}.`)
    if (sugar || malt) mixBody.push(`Stir in ${[sugar && `${ctx.w(sugar.grams)} sugar`, malt && `${ctx.w(malt.grams)} diastatic malt`].filter(Boolean).join(' and ')}.`)
    if (starter) mixBody.push(`Add ${ctx.w(starter.grams)} ripe starter and break it up in the water.`)
    if (flour) mixBody.push(`Add about 10 % of the ${ctx.w(flour.grams)} flour and mix to a batter.`)
    if (yeast && yeast.grams > 0.001)
      mixBody.push(
        yeast.grams < 0.3
          ? `Add ${ctx.w(yeast.grams)} ${YEAST_LABEL[r.yeastType].toLowerCase()} — too little to weigh? Dissolve 1 g in 100 g water and use ${ctx.w(yeast.grams * 100)} of that solution.`
          : `Add ${ctx.w(yeast.grams)} ${YEAST_LABEL[r.yeastType].toLowerCase()}. Keep yeast and salt from sitting together for more than a few minutes.`,
      )
    mixBody.push('Add the rest of the flour gradually until the dough comes together.')
  }
  steps.push({
    key: 'final-mix',
    stageId: 'final',
    title: r.method === 'indirect' ? 'Mix the final dough' : 'Mix the dough',
    atH: startH,
    body: mixBody,
  })

  const knead: string[] = []
  if (byHand) {
    if (hydr >= 68) {
      knead.push('Rest 15–20 minutes, then do 3–4 sets of stretch-and-folds (or slap-and-folds) 15–20 minutes apart until smooth and strong.')
    } else {
      knead.push('Knead on the bench for 10–15 minutes, with a 5-minute rest halfway, until smooth and elastic.')
    }
  } else if (mixer.id === 'spiral') {
    knead.push('First speed 4–5 minutes, then second speed 3–6 minutes until the dough clears the bowl.')
  } else if (mixer.id === 'fork' || mixer.id === 'diving') {
    knead.push('Low speed for 15–20 minutes total until smooth and elastic — slow and cool.')
  } else if (mixer.id === 'processor') {
    knead.push('Pulse to combine, then process 45–60 seconds. Rest 10 minutes and knead briefly by hand.')
  } else {
    knead.push('Dough hook: speed 1–2 for 3–4 minutes, then speed 2–3 for 4–6 minutes. Rest the mixer if the dough warms fast.')
  }
  if (reserve) knead.push(`Once the dough is strong, add the held-back ${ctx.w(reserve.grams)} of water a little at a time, waiting until each addition is absorbed.`)
  if (oil) knead.push(`Add ${ctx.w(oil.grams)} olive oil last and mix until it disappears.`)
  const extra = s.waterPlan?.extraMixMin ?? 0
  if (extra > 0)
    knead.push(
      `Mix about ${extra} minutes longer than usual (${Math.max(1, r.final.mixMinutes) + extra} minutes in all): with the water capped at ${ctx.t(s.waterPlan!.maxWaterC, 0)}, the friction is what warms the dough the rest of the way. Stop early if it is already smooth, strong and warm enough.`,
    )
  knead.push(`Check the temperature: aim for ${ctx.t(r.kitchen.targetFdtC, 1)} (expected ${ctx.t(s.mixTempC, 1)}). Note the actual value to calibrate your mixer.`)
  knead.push('Done when smooth, slightly tacky and a small piece stretches into a thin, translucent sheet.')
  steps.push({ key: 'final-knead', stageId: 'final', title: 'Knead & develop', atH: startH + 0.1, body: knead })

  for (const f of res.timeline.filter((e) => e.kind === 'fold'))
    steps.push({ key: `final-${f.id}`, stageId: 'final', title: f.title, atH: f.atH, body: [f.detail] })

  // Fermentation phases grouped around balling.
  const bulk = s.phases.filter((p) => (p.stage ?? 'bulk') === 'bulk')
  const balls = s.phases.filter((p) => p.stage === 'balls')
  if (bulk.length) {
    steps.push({
      key: 'final-bulk',
      stageId: 'final',
      title: 'Bulk fermentation (puntata)',
      atH: bulk[0].startH,
      body: [
        `Cover the dough and let it rest ${bulk.map((p) => `${formatHours(p.hours)} ${p.location === 'fridge' ? 'in the fridge' : `at ${ctx.t(p.tempC, 0)}`}`).join(', then ')}.`,
        ...(bulk.some((p) => p.location === 'fridge')
          ? ['Use a lidded, lightly oiled container. A flatter container chills (and later warms) faster.']
          : []),
        ...(hydr >= 72 ? ['A set of coil folds in the first hour helps high-hydration doughs hold shape.'] : []),
      ],
    })
  }
  const pieces = res.pieces
  {
    const at = balls[0]?.startH ?? -0.25
    steps.push({
      key: 'final-ball',
      stageId: 'final',
      title: r.sizing.mode === 'pans' ? 'Divide & pan' : 'Divide & ball (staglio)',
      atH: at,
      body:
        r.sizing.mode === 'pans'
          ? [
              `Divide into ${pieces} piece${pieces === 1 ? '' : 's'} of about ${ctx.w(res.pieceWeight)}.`,
              'Oil the pans generously, shape each piece into a loose ball and set it in its pan, seam down.',
              'If the dough springs back when you press it out, wait 20–30 minutes and try again.',
            ]
          : [
              `Divide into ${pieces} balls of ${ctx.w(res.pieceWeight)} (there is a small allowance for dough left in the bowl).`,
              'Fold the edges into the centre, flip seam-down and drag each ball towards you on the bench to tighten the skin.',
              `Place in a covered tray or ${balls.some((p) => p.location === 'fridge') ? 'lightly oiled lidded containers' : 'containers'}, leaving room for them to double.`,
            ],
    })
  }
  if (balls.length) {
    const body: string[] = [
      `Proof ${balls.map((p) => `${formatHours(p.hours)} ${p.location === 'fridge' ? 'in the fridge' : `at ${ctx.t(p.tempC, 0)}`}`).join(', then ')}.`,
    ]
    const last = balls[balls.length - 1]
    const prev = balls[balls.length - 2]
    if (prev && prev.location === 'fridge' && last.location !== 'fridge')
      body.push(
        `Out of the fridge the balls start at ≈ ${ctx.t(prev.endDoughC, 0)} and should reach ≈ ${ctx.t(last.endDoughC, 0)} by bake time. Keep them covered so they don’t form a skin.`,
      )
    steps.push({ key: 'final-proof', stageId: 'final', title: 'Final proof (appretto)', atH: balls[0].startH, body })
  }

  steps.push({
    key: 'preheat',
    stageId: 'final',
    title: `Preheat the ${oven.name.toLowerCase()}`,
    atH: -oven.preheatMin / 60,
    body: [
      `${oven.blurb}`,
      `Target ${ctx.t(oven.tempC[0], 0)}–${ctx.t(oven.tempC[1], 0)}; bake time ${oven.bake}.`,
    ],
  })
  steps.push({
    key: 'ready-check',
    stageId: 'final',
    title: 'Is it ready?',
    atH: -0.25,
    body: [
      'Relaxed, about 1.5–2× the original volume, with small bubbles under the skin.',
      'Poke test: a floured fingertip dent that springs back slowly and only partly = ready. Springs back fast = give it more time; doesn’t spring back = bake now, handle gently.',
    ],
  })
  steps.push({
    key: 'bake',
    stageId: 'final',
    title: 'Shape & bake',
    atH: 0,
    body: [style.shaping, `Bake: ${style.bake}.`],
  })
  return steps
}

export function buildGuide(
  r: Recipe,
  res: RecipeResult,
  units: { temp: TempUnit; weight: WeightUnit },
): GuideStep[] {
  const ctx: Ctx = {
    r,
    res,
    t: (c, d = 1) => formatTemp(c, units.temp, d),
    w: (g) => formatWeight(g, units.weight),
  }
  const steps: GuideStep[] = []
  const prefStages = res.stages.filter((s) => s.kind === 'preferment').sort((a, b) => a.startH - b.startH)
  for (const feed of res.timeline.filter((e) => e.kind === 'feed'))
    steps.push({
      key: feed.id,
      stageId: feed.stageId,
      title: feed.title,
      atH: feed.atH,
      body: [feed.detail, 'Equal weights of starter, flour and water; keep it at room temperature.'],
    })
  for (const s of prefStages) steps.push(...prefermentSteps(ctx, s))
  steps.push(...finalSteps(ctx))
  // Preset copy (oven notes, bake times) is written in °C.
  const L = (s: string) => localizeTemps(s, units.temp)
  return steps
    .sort((a, b) => (a.atH ?? 0) - (b.atH ?? 0))
    .map((s) => ({ ...s, title: L(s.title), body: s.body.map(L) }))
}
