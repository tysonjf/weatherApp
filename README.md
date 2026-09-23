# 🍕🌦️ Pizza Weather

**The dough forecast.** Pizza Weather is a pizza dough calculator and planner, built as an offline-first PWA
with React and Vite. You give it your dough, your preferments, your kitchen and when you want to eat. It works
out every gram of yeast, starter, flour, water, salt and ice, the water temperature for each mix, and a
timeline that runs back from the bake.

It is in the spirit of MasterBiga and Pizzapp, but any recipe can mix several preferments (biga + poolish,
licoli + yeast, …), each with its own multi-phase schedule across room, fridge and custom temperatures.

## Features

**Planning**
- **Multi-stage wizard**: style → dough → method → *one page per preferment* → final dough → kitchen → review.
- **Methods**: direct yeast, direct sourdough, biga, poolish, biga + poolish, levain (licoli / lievito madre,
  sized to your schedule), or any custom mix of biga, poolish, sponge, old dough, lievito madre, licoli and custom
  preferments.
- **Real schedules**: every stage is a list of phases (room, fridge or a custom temperature), e.g.
  *biga 10 h room → 14 h fridge*, *poolish 1 h → 20 h fridge → 1 h wake-up*, *bulk 2 h → balls 48 h cold → 4 h
  tempering*. Ready-made plans for each preferment, including fridge modes. Warm kitchens follow MasterBiga: a
  room-temperature biga up to 26 °C, two stages timed for 1 % yeast above, fridge-only above 30 °C.
- **Plans that add up**: new doughs start balanced, and when a plan would over- or under-ferment (say, a big
  fridge biga before cold balls) the warning comes with one-tap fixes, each checked with the model first: a shorter
  or longer final rise, more of it in the fridge, a smaller or bigger preferment, a biga that starts at room
  temperature, or letting the app work out the yeast.
- **Fit around your day**: set your sleeping (and optional working) hours and the plan flags any hands-on step
  that lands in them. One tap re-times it (fridge time first) while keeping the bake time and re-solving the yeast.
- **Technique**: autolyse and timed stretch-and-fold sets in the guide and timeline; bassinage.
- **23 styles**: Neapolitan (AVPN), contemporary/canotto, New York, New Haven apizza, Roman tonda, Roman teglia,
  pala romana, pinsa, Detroit, Sicilian/grandma, Greek, cast-iron pan, Chicago deep dish, Chicago tavern, bar pie,
  Quad Cities, cracker thin, California, calzone, pizza fritta, focaccia, focaccia genovese, custom.
- **Flours**: Caputo and Le 5 Stagioni specs from the mills, US/UK/AU categories, wholemeal and semola, and
  **blends** (weighted W and protein, extra-water and fermentation hints for whole grain).

**The forecast**
- **Yeast and starter from time and temperature**, so each stage is ripe exactly when the next one needs it; leftover
  preferment yeast counts into the final dough.
- **Thermal lag**: every piece (bulk, balls, pans) cools and warms by its mass, so the warm hours after it goes into
  the fridge count.
- **A room that cools at night**: optional night temperature; the model follows the clock through every phase.
- **Ripeness chart and bake window**: how ripe each stage is over time, when the dough bakes well (85–130 % of the
  plan) and what happens if the pizzas wait.
- **Water temperature from a heat balance** for every mix, switching to ice automatically and telling you when to
  chill the flour; optional classic DDT comparison. It never asks for water warmer than your limit (30 °C by
  default): a cold preferment rests out of the fridge first, just long enough, and a mixer that heats mixes a few
  minutes longer.

**While you make it**
- **Live tracking**: tick a mix in the bake guide with its real time and probe temperature — the yeast is locked in
  and the forecast follows your dough. A **sample-jar** reading (% rise) tells the model how fast your dough really is.
- **Plans changed?** Pick a new bake time: move the next step, hold the dough at a steady temperature (with where
  to find that at home) or bake when it's ready — every option simulated, nothing in the past moves.
- **Bake guide** with check-offs, next-step countdowns, and a calendar (`.ics`) export with alarms.
- **Tiny amounts**: teaspoon measures and the 1 % yeast solution trick when an amount is too small for your scale.

**Pizza night**
- Guests and appetite → how many balls or pans, by style; toppings per pizza (AVPN amounts, US portion loadings,
  Detroit and pan loads), sauce recipe and a shopping list with pack counts.
- Oven pace → service plan; cold balls come out of the fridge **in waves** so the last pizza is as good as the first.
- **Bake mode**: a full-screen oven timer with turn beeps, pizza count and take-out waves; the screen stays awake.

**Getting better every bake**
- **Bake journal**: rate each bake and note when it was really ready. The app turns that into your personal yeast
  calibration and starter speed and suggests them.
- **Calibrations**: mixer heat (measure one batch), yeast, starter speed (1 : 1 : 1 peak test), altitude
  (air-pressure correction).

**And**
- 8 tools (water temperature, yeast ⇄ time, yeast table, converter, mixer calibration, pan & ball size, baker's %,
  starter planner), 14 guides, optional local weather (Open-Meteo), share links, backup/restore to a JSON file,
  °C/°F everywhere (guides included), g/oz, 12/24 h, light/dark. Offline-first, installable, no account: all data
  stays in the browser.

## Running it

Needs Node 22.22+ (or 24.15+) and pnpm.

```sh
pnpm install
pnpm dev          # dev server
pnpm test         # the whole Vitest suite (engine, state and UI)
pnpm test:watch   # re-run tests as you edit
pnpm lint         # oxlint
pnpm build        # type-check + production build into dist/
pnpm preview      # serve the production build (service worker included)
pnpm icons        # regenerate PWA icons from public/logo.svg
```

### Testing

About 450 Vitest tests, in about 10 seconds. They check the numbers against published targets, not
just against themselves:

| Suite | What it checks |
| --- | --- |
| `engine/targets.test.ts` | Published reference points: Craig's yeast chart, AVPN yeast and salt, MasterBiga timings, the poolish table, Craig's sourdough chart and everyday starter percentages, the heat of hydration, dough-ball cooling times, a fridge biga's rest before the final mix (30 min – 3 h, water ≤ 30 °C), yeast-type ratios, altitude pressure, AVPN/NY/Detroit toppings and portions. |
| `engine/invariants.test.ts` | Every style × every leavening method × 16–32 °C kitchens, with and without cool nights: the mass and baker's percentages add up, nothing is NaN, automatic stages are ripe exactly on time, water and ice stay within their limits, the timeline and bake guide are in order, and °F users never see °C. |
| `engine/presets.test.ts` | The style, oven, flour, schedule, preferment and mixer data is consistent (every reference exists, every default sits in its range, no sugar or oil in a 400 °C+ oven). |
| `engine/balance.test.ts` | Every fix for an over- or under-fermenting plan lands the dough in the window and changes only what it says; the bug-report plan (fridge biga + cold balls) leads with the biga; every new dough, style × method × 18–30 °C, starts balanced. |
| `engine/*.test.ts` | Each model on its own: fermentation, thermal lag, water temperature (and the textbook ice rule), units, live re-planning, fitting your day, calibration, pizza night, small quantities. |
| `state/*.test.ts` | New recipes from every style and method, switching styles, migrating old saves, share links, the store (duplicates, backups, reloads). |
| `app.test.tsx` | The UI in jsdom: the wizard end to end, every style and method on every tab, editing, the menu, the journal, live tracking, bake mode, import, tools, guides and settings, the one-tap fixes and the rest out of the fridge. Any React error fails the test. |

Engine tests run in Node; UI tests opt into jsdom with a `// @vitest-environment jsdom` comment. CI
(`.github/workflows/ci.yml`) runs lint, the tests and the build on every push and pull request.

### Deploying

`dist/` is a static site: routing is hash-based, so no server rewrites are needed. To serve from a
sub-path, set `BASE_PATH`:

```sh
BASE_PATH=/weatherApp/ pnpm build
```

`.github/workflows/deploy.yml` builds and publishes to **GitHub Pages** on every push to `main` (or on a
manual run). Turn it on once under *Settings → Pages → Build and deployment → Source: GitHub Actions*. The
app is then at `https://<user>.github.io/<repo>/`. Open it on your phone and use *Add to Home Screen*.
`netlify.toml` builds the same app on Netlify, if the repo is connected to a Netlify site.

## How the numbers are worked out

The engine is in `src/engine/` and is plain TypeScript with no UI. Its tests sit next to it in `src/engine/*.test.ts`.

| What | Model |
| --- | --- |
| Yeast vs time & temperature | Fit to Craig's (TXCraig1, pizzamaking.com) fermentation chart: `H(Y,T) = H₁(T)·Y^−0.728`, with a quartic `ln H₁(T)`. Time at any temperature is converted into **equivalent hours at 21 °C** and summed over the whole plan. |
| Salt, sugar, fat, hydration | Calcolapizza-style multiplier `(1+S/200)(1+G/300) / (4.2·I − 80 − 0.0305·I²)` (S and G in g per litre of water, I = hydration), normalised to a 63 %, 2.8 % salt reference dough. |
| Biga | MasterBiga timing law: with 1 % fresh yeast a biga ripens in K(H)/T hours (T in °C, above ~12 °C) with K = 370 − 5.81·(H − 40). That gives ≈ 19 h at 18 °C for a 45 % biga, Giorilli's classic. Other yeast doses scale with Craig's exponent, and below ~12 °C the rate follows Craig's curve. |
| Poolish | The Italian poolish table (≈ 3.5 % fresh yeast → 1 h … 0.1 % → 16 h at 21 °C), converted to equivalent hours. |
| Sourdough | Craig's sourdough chart: starter % = 89.4 · 2^(−Σt/D(T)). Levain builds (no salt) run about 1.6× faster, and a 1 : 1 : 1 feed peaks after about 1.95 doublings. From that come feed ratios, levain timing and starter %. |
| Several leaveners | Each preferment's leftover yeast or ripeness counts towards the final dough. The final dough's extra yeast only makes up the rest. |
| Thermal lag | Newton cooling per piece with τ ≈ 2 h × ∛(mass / 250 g), integrated in ≤ 6-minute steps. The chart and the ripeness both use the simulated dough temperature. |
| Water temperature | Heat balance: flour 1.80, water 4.186, salt 0.86, oil 2.0, sugar 1.25 kJ/kg·K; preferments as their flour/water mix; +15.1 kJ per kg of newly wetted flour (hydration heat); plus the mixer's mechanical rise. Ice uses latent heat 333.6 kJ/kg, which reproduces the textbook `(tap − need)/(tap + 80)` rule. Ice is capped at 35 % of the water and the water at your warmest (30 °C by default). |
| Cold preferments | A preferment that ends colder than the kitchen rests out of the fridge before the final mix, carved out of its cold phase (same start, same mix time): the shortest rest, in 15-minute steps up to 3 h, that keeps the water under your limit, found by bisection on Newton warming. If that isn't enough, the final mix runs longer (friction at the mixer's rate per minute, up to half as long again); the rest is left as a cooler start the forecast allows for. |
| Balancing | Fixes are found by bisection on one knob each — a scale on the final phases (warm-up after the fridge kept, sub-1.5 h fridge stints dropped), fridge hours at a fixed total, the preferment shares, or MasterBiga's room/fridge split for a biga (room ≈ 0.73 × K(H)/T for 1 % yeast) — and each is re-run through the full model before it's offered. |
| Yeast types | Fresh = 1, active dry = 0.4, instant = ⅓ (by weight). |
| Ripeness & bake window | Every leavening is linear in its clock, so ripeness over time is a straight map of the simulated clocks. The final dough is simulated 8 h past the bake to find when it leaves the 85–130 % window. |
| Room at night | Cosine between the day (warmest ~16:00) and night (coolest ~04:00) temperatures, evaluated on each phase's real clock. |
| Live re-planning | Mixed stages keep their locked yeast; options edit only future phases (the current one is split at "now") and each is scored by the full model, with bisection for hold temperature and step shifts. Sample-jar rise maps to ripeness as rise = 2^(ripeness × target) − 1. |
| Fitting your day | Greedy: for each clashing step, scan stretching any later phase or moving just that step's boundary over the whole sensible range; the cheapest few candidates are re-run through the model and penalised if they would leave the dough badly over/under-ripe. |
| Learning from bakes | "Ready Δh late" at the last temperature T → extra equivalent hours Δ·rate(T) → yeast × ((E+Δ·rate)/E)^(1/0.728); sourdough → starter speed × D/(D + Δ/D(T)). Recency-weighted geometric mean. |
| Altitude | Yeast and starter × standard-atmosphere pressure ratio (≈ 0.83 at 1,500 m): the same gas takes more volume in thin air. |

These models come from well-established community data and bakery practice. They are still a forecast:
flours, starters, fridges and yeast brands vary. Use the dough temperature probe, the mixer calibration and
the yeast calibration to tune the app to your kitchen.

## Project layout

```
src/
  engine/      calculation engine: fermentation, thermal, temperature, composition, timeline, presets,
               ambient (day/night), replan (live), schedule (fit your day), calibration, party, measures, altitude
  state/       zustand store (persisted, backup), recipe factories/migrations, settings, share links
  pages/       home, new dough, wizard steps, recipe (recipe / forecast / bake guide / pizza night / formula,
               live card, bake mode), journal, tools, guides, settings
  components/  UI kit, temperature chart, phase editor, stage cards, timeline, weather card
  content/     long-form guides
  lib/         calendar export, time helpers, weather
  test/        Vitest setup (jsdom stubs, service-worker stand-in)
public/        icons and logo
scripts/       icon generation helpers
```
