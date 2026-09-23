# 🍕🌦️ Pizza Weather

**The dough forecast.** Pizza Weather is a pizza dough calculator and planner, built as an offline-first PWA
with React and Vite. You give it your dough, your preferments, your kitchen and when you want to eat. It works
out every gram of yeast, starter, flour, water, salt and ice, the water temperature for each mix, and a
timeline that runs back from the bake.

It is in the spirit of MasterBiga and Pizzapp, but any recipe can mix several preferments (biga + poolish,
licoli + yeast, …), each with its own multi-phase schedule across room, fridge and custom temperatures.

## Features

- **Multi-stage wizard**: style → dough → method → *one page per preferment* → final dough → kitchen → review.
- **Methods**: direct yeast, direct sourdough, biga, poolish, biga + poolish, levain (licoli / lievito madre),
  or any custom mix of biga, poolish, sponge, old dough, lievito madre, licoli and custom preferments.
- **Real schedules**: every stage is a list of phases (room, fridge or a custom temperature), e.g.
  *biga 2 h room → 22 h fridge*, *poolish 1 h → 20 h fridge → 1 h wake-up*, *bulk 2 h → balls 48 h cold → 4 h
  tempering*. Ready-made plans for each preferment, including fridge modes.
- **Yeast and starter from time and temperature**: amounts are solved so each stage is ripe exactly when
  the next one needs it. Fresh, active dry and instant yeast, starter feed ratios (1 : x : y), and leftover
  preferment yeast counted into the final dough.
- **Thermal lag**: dough doesn't hit fridge temperature straight away. Every piece (bulk, balls, pans) cools
  and warms by its mass, so the plan counts the warm hours after it goes in the fridge.
- **Water temperature from a heat balance**: for every mix (preferments and final dough), using specific
  heats, flour hydration heat, cold preferments, flour temperature and your mixer's heat. It switches to
  ice automatically and tells you when you need to chill the flour. It can also show the classic DDT
  "3× / 4× rule" for comparison.
- **Mixer calibration**: measure one batch and the app back-solves your mixer's heat (hand, fork, diving
  arm, spiral, planetary, Ankarsrum, food processor, bread machine).
- **Personal yeast calibration**: if your doughs always run slow or fast, one setting scales every yeast and
  starter amount.
- **Forecast tab**: chart of air and dough temperature over the whole plan (crosshair tooltip, table view).
- **Bake guide**: step-by-step instructions with times, check-offs and "next step" countdowns on the home
  screen. You can also export the plan as an `.ics` calendar with alarms.
- **Styles**: Neapolitan (AVPN), contemporary/canotto, New York, Roman tonda, Roman teglia, Detroit,
  Sicilian/grandma, cast-iron pan, Chicago tavern, pinsa, focaccia, custom. Ball or pan sizing
  (dough per area).
- **Tools**: water temperature, yeast ⇄ time predictor, yeast forecast table, yeast converter, mixer
  calibration, pan & ball size, baker's percentages (including a starter), starter feeding planner.
- **Guides**: how the forecast works, biga, poolish, sourdough, dough temperature, cold fermentation, mixing,
  balling, flour strength (W), baking by oven, troubleshooting.
- **Local weather** (optional, Open-Meteo, no key) with a "dough outlook" for your kitchen.
- Share links that carry the whole recipe, °C/°F, g/oz, 12/24 h, light/dark theme. Works offline
  and installs to the home screen. All data stays in the browser (localStorage).

## Running it

Needs Node 20.19+ (or 22.12+) and pnpm.

```sh
pnpm install
pnpm dev          # dev server
pnpm test         # engine unit tests (Vitest)
pnpm lint         # oxlint
pnpm build        # type-check + production build into dist/
pnpm preview      # serve the production build (service worker included)
pnpm icons        # regenerate PWA icons from public/logo.svg
```

### Deploying

`dist/` is a static site: routing is hash-based, so no server rewrites are needed. To serve from a
sub-path, set `BASE_PATH`:

```sh
BASE_PATH=/weatherApp/ pnpm build
```

`.github/workflows/deploy.yml` builds and publishes to **GitHub Pages** on every push to `main` (or on a
manual run). Turn it on once under *Settings → Pages → Build and deployment → Source: GitHub Actions*. The
app is then at `https://<user>.github.io/<repo>/`. Open it on your phone and use *Add to Home Screen*.

## How the numbers are worked out

The engine is in `src/engine/` and is plain TypeScript with no UI. Tests are in `src/engine/*.test.ts`.

| What | Model |
| --- | --- |
| Yeast vs time & temperature | Fit to Craig's (TXCraig1, pizzamaking.com) fermentation chart: `H(Y,T) = H₁(T)·Y^−0.728`, with a quartic `ln H₁(T)`. Time at any temperature is converted into **equivalent hours at 21 °C** and summed over the whole plan. |
| Salt, sugar, fat, hydration | Calcolapizza-style multiplier `(1+S/200)(1+G/300) / (4.2·I − 80 − 0.0305·I²)` (S and G in g per litre of water, I = hydration), normalised to a 63 %, 2.8 % salt reference dough. |
| Biga | MasterBiga timing law: with 1 % fresh yeast a biga ripens in K(H)/T hours (T in °C, above ~12 °C) with K = 370 − 5.81·(H − 40). That gives ≈ 19 h at 18 °C for a 45 % biga, Giorilli's classic. Other yeast doses scale with Craig's exponent, and below ~12 °C the rate follows Craig's curve. |
| Poolish | The Italian poolish table (≈ 3.5 % fresh yeast → 1 h … 0.1 % → 16 h at 21 °C), converted to equivalent hours. |
| Sourdough | Craig's sourdough chart: starter % = 89.4 · 2^(−Σt/D(T)). Levain builds (no salt) run about 1.6× faster, and a 1 : 1 : 1 feed peaks after about 1.95 doublings. From that come feed ratios, levain timing and starter %. |
| Several leaveners | Each preferment's leftover yeast or ripeness counts towards the final dough. The final dough's extra yeast only makes up the rest. |
| Thermal lag | Newton cooling per piece with τ ≈ 2 h × ∛(mass / 250 g), integrated in ≤ 6-minute steps. The chart and the ripeness both use the simulated dough temperature. |
| Water temperature | Heat balance: flour 1.80, water 4.186, salt 0.86, oil 2.0, sugar 1.25 kJ/kg·K; preferments as their flour/water mix; +15.1 kJ per kg of newly wetted flour (hydration heat); plus the mixer's mechanical rise. Ice uses latent heat 333.6 kJ/kg, which reproduces the textbook `(tap − need)/(tap + 80)` rule. Water is capped at 35 °C and ice at 35 % of the water. |
| Yeast types | Fresh = 1, active dry = 0.4, instant = ⅓ (by weight). |

These models come from well-established community data and bakery practice. They are still a forecast:
flours, starters, fridges and yeast brands vary. Use the dough temperature probe, the mixer calibration and
the yeast calibration to tune the app to your kitchen.

## Project layout

```
src/
  engine/      calculation engine (fermentation, thermal, temperature, composition, timeline, presets)
  state/       zustand store (persisted), recipe factories/migrations, settings, share links
  pages/       home, new dough, wizard steps, recipe (recipe / forecast / bake guide / formula), tools, guides, settings
  components/  UI kit, temperature chart, phase editor, stage cards, timeline, weather card
  content/     long-form guides
  lib/         calendar export, time helpers, weather
public/        icons and logo
scripts/       icon generation helpers
```
