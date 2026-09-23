import type { ReactNode } from 'react'
import { Delta } from '../components/Delta'

export interface Guide {
  id: string
  title: string
  emoji: string
  summary: string
  body: ReactNode
}

export const GUIDES: Guide[] = [
  {
    id: 'how-it-works',
    title: 'How the forecast works',
    emoji: '🌦️',
    summary: 'Fermentation as a forecast: yeast, time, temperature, thermal lag and the heat balance.',
    body: (
      <>
        <p>
          Every dough is a small weather system. Yeast activity rises steeply with temperature, so the same amount of
          yeast can be ready in 6 hours on a hot day or need 3 days in the fridge. Pizza Weather treats fermentation as{' '}
          <b>progress towards ripeness</b>: each hour at a given dough temperature contributes a fraction of the
          total job, and the recipe is ripe when the fractions add up to 100 %.
        </p>
        <h3>Yeast from time and temperature</h3>
        <p>
          The yeast model is built on the empirical data behind Craig's (TXCraig1) fermentation chart from
          pizzamaking.com — thousands of dough-doubling observations across 1.5–35 °C — converted into a continuous
          model. For a plan with several phases (for example 2 h at room temperature, 48 h in the fridge, then 4 h out
          again), the app solves for the yeast amount whose accumulated progress hits exactly 100 % when you bake.
        </p>
        <h3>Thermal lag</h3>
        <p>
          Dough does not teleport to fridge temperature. A 250 g ball takes about 3 hours to cool from 24 °C to 8 °C in
          a 4 °C fridge, and a 2 kg tub of bulk dough can stay above 10 °C for 5–6 hours. Those warm hours carry a large
          share of the fermentation, which is why cold doughs made with "fridge" yeast charts often over-proof. Pizza
          Weather simulates the dough temperature minute by minute (Newton cooling with a time constant that scales with
          the piece size) and ferments on the dough temperature, not the air temperature.
        </p>
        <h3>Preferments</h3>
        <p>
          Each preferment (biga, poolish, sponge, sourdough…) is fermented on its own schedule and gets its own yeast.
          When it goes into the final dough it brings a ripe, active yeast population. The app credits that leavening
          power and only adds extra yeast to the final dough if the preferments can't carry the final fermentation on
          their own — and warns you when they would over-ferment it.
        </p>
        <h3>Water temperature</h3>
        <p>
          Instead of the bakers' "multiply by three" rule, the water temperature comes from a heat balance: each
          ingredient's mass × specific heat × temperature, plus the heat released when dry flour gets wet (≈ <Delta sign="+" c={3} /> in a
          65 % dough), plus your mixer's kneading heat. It handles cold preferments straight from the fridge and tells
          you exactly how much ice to use when your tap water isn't cold enough.
        </p>
        <h3>Calibrate it</h3>
        <p>
          Kitchens, flours and thermometers differ. Use the <b>Mixer calibration</b> tool once (measure your dough
          after mixing) and nudge yeast in the recipe if your dough runs consistently fast or slow — the model will
          scale everything else around your correction.
        </p>
      </>
    ),
  },
  {
    id: 'biga',
    title: 'Biga',
    emoji: '🧱',
    summary: 'Stiff Italian preferment: 44–50 % water, ~1 % fresh yeast, 16–24 h at 18 °C (or a cold variant).',
    body: (
      <>
        <p>
          A biga is a low-hydration preferment (classically 44–45 % water, Giorilli's method) made with strong flour
          (W 300–380). It ferments slowly, builds lots of aroma with little acidity, and gives light, open, crunchy
          crusts. Contemporary Neapolitan "canotto" pizzas are often 50–100 % biga.
        </p>
        <h3>Classic ratios</h3>
        <ul>
          <li>Flour 100 · water 44–50 · fresh yeast 1 % (≈ 0.33 % instant dry).</li>
          <li>Mix to 18–20 °C, ferment 16–24 h at about 18 °C. That's the reference point everything else scales from.</li>
          <li>Warmer room → less yeast or shorter time; colder → more. Pizza Weather computes it for your schedule.</li>
          <li>Cold biga: 24 h at 4 °C + 12–24 h at 16–18 °C, or 1 h room → 24–48 h fridge. Take it out 1–2 h before the final mix if you want it less cold (the water temperature compensates either way).</li>
        </ul>
        <h3>How to mix</h3>
        <ol>
          <li>Dissolve (or scatter, if instant) the yeast in the water. Use the water temperature from the app.</li>
          <li>Add the flour and mix briefly — 3–5 minutes by hand, 2–4 minutes on low speed. Stop as soon as all flour is moistened.</li>
          <li>It should look shaggy and crumbly, like wet gravel — <b>not</b> a smooth dough. No gluten development.</li>
          <li>Loosely pile it in a container with room to grow, cover (not airtight) and ferment.</li>
        </ol>
        <h3>When it's ready</h3>
        <ul>
          <li>Grown noticeably and domed, with a dry-looking surface and lots of tiny holes inside when torn.</li>
          <li>Smells sweet, fruity and lightly alcoholic (yogurt/apple). Sharp vinegar or solvent smell = over-ripe.</li>
          <li>Should break apart easily; if it's collapsed and wet, it went too far — cut its time or yeast next bake.</li>
        </ul>
        <h3>Final dough (the "rinfresco")</h3>
        <ol>
          <li>Break the biga into pieces in the bowl, add most of the water (use the app's temperature) and any extra yeast; mix to loosen.</li>
          <li>Add the remaining flour (if any) and mix until it comes together.</li>
          <li>Add salt, then knead; add the reserved water (bassinage) a little at a time only once the dough is strong.</li>
          <li>Add oil (if any) last. Aim for the target final dough temperature.</li>
        </ol>
        <p className="muted">
          With 100 % biga no extra yeast is usually needed and bulk + ball proof is short (≈ 1 h + 3–6 h at room). With
          30–50 % biga the app adds a small amount of yeast for the fresh flour if the schedule needs it.
        </p>
      </>
    ),
  },
  {
    id: 'poolish',
    title: 'Poolish',
    emoji: '🫧',
    summary: 'Liquid preferment: equal flour and water. Yeast from 1.5 % (3 h) down to 0.1 % (overnight).',
    body: (
      <>
        <p>
          Poolish is a batter of equal weights of flour and water with a little yeast. It ferments fast, adds
          extensibility and a mild, nutty-sweet flavour, and makes doughs easy to stretch. Pizza doughs typically put
          20–50 % of the flour into the poolish (sometimes all of the water).
        </p>
        <h3>Yeast by time (fresh yeast on poolish flour, ~20–24 °C)</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fermentation</th>
                <th>Fresh yeast</th>
                <th>Instant dry</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2–3 h</td>
                <td>1.5 %</td>
                <td>0.5 %</td>
              </tr>
              <tr>
                <td>6–8 h</td>
                <td>0.7 %</td>
                <td>0.23 %</td>
              </tr>
              <tr>
                <td>12–16 h</td>
                <td>0.1–0.2 %</td>
                <td>0.03–0.07 %</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small">The classic French rule of thumb. Pizza Weather computes the exact amount for your temperatures.</p>
        <h3>How to make it</h3>
        <ol>
          <li>Dissolve the yeast (and honey, if using ~1 % of poolish flour — it speeds and colours) in the water.</li>
          <li>Whisk in the flour until smooth and lump-free. 1–2 minutes by hand is enough.</li>
          <li>Cover and ferment. Popular home schedule: 1 h at room, then 16–24 h in the fridge.</li>
        </ol>
        <h3>When it's ready</h3>
        <ul>
          <li>Surface covered in bubbles, domed and just beginning to recede — a faint ring on the container wall above the surface.</li>
          <li>Smells sweet and yeasty, slightly alcoholic. If it has collapsed and smells sharp, it's past peak.</li>
        </ul>
        <h3>Final dough</h3>
        <ol>
          <li>Pour the poolish into the bowl with the (temperature-adjusted) water and any extra yeast; stir to loosen.</li>
          <li>Add the flour gradually, mixing until no dry flour remains. Rest 10–20 min if the dough feels tight.</li>
          <li>Add salt, knead to good strength, then bassinage (reserved water) and oil last.</li>
        </ol>
        <p className="muted">A cold poolish straight from the fridge is fine — the app raises the water temperature to compensate.</p>
      </>
    ),
  },
  {
    id: 'sourdough',
    title: 'Sourdough: lievito madre & licoli',
    emoji: '🫙',
    summary: 'Stiff (50 %) or liquid (100 %) starters, feeding ratios, peak timing and inoculation.',
    body: (
      <>
        <p>
          Natural leavening works like a slow, temperature-sensitive yeast plus lactic bacteria. For pizza it gives depth
          and a crisp-chewy crumb; it's slower and less predictable than commercial yeast, so it pays to feed the starter
          on a schedule and use it at peak.
        </p>
        <h3>Two common forms</h3>
        <ul>
          <li>
            <b>Lievito madre (stiff, ~45–50 %)</b>: fed 1 : 1 : 0.5 (starter : flour : water). Milder acidity, strong
            leavening. Peaks in ~3–4 h at 26–28 °C.
          </li>
          <li>
            <b>Licoli / liquid levain (100 %)</b>: fed 1 : 1 : 1 or 1 : 2 : 2. More lactic, very active. 1 : 1 : 1
            peaks in ~4–6 h at 24 °C; 1 : 5 : 5 overnight.
          </li>
        </ul>
        <h3>Inoculation</h3>
        <p>
          Pizza doughs typically use 5–25 % ripe starter on total flour. Lower inoculation → longer, more sour
          fermentation; higher → faster and milder. Pizza Weather counts the starter's flour and water in your hydration,
          and can compute the inoculation for your schedule.
        </p>
        <h3>Readiness</h3>
        <ul>
          <li>Doubled (licoli) or domed and grown 2–3× (stiff madre), full of bubbles, pleasantly acidic smell.</li>
          <li>Float test (liquid starter): a spoonful floats in water when it's close to peak.</li>
        </ul>
        <p className="muted">
          Many pizzaioli combine a small amount of commercial yeast with sourdough for predictability. Set extra yeast to
          "auto" in the final dough and the app will top up only what the starter can't do.
        </p>
      </>
    ),
  },
  {
    id: 'temperature',
    title: 'Water temperature & final dough temperature',
    emoji: '🌡️',
    summary: 'Why the end-of-kneading temperature matters, targets, ice, and cold preferments.',
    body: (
      <>
        <p>
          The dough's temperature at the end of mixing (final dough temperature, FDT — <i>temperatura finale
          dell'impasto</i>) sets the pace of everything that follows. <Delta c={2} /> too warm can take hours off a room-temperature
          ferment. Controlling it is the cheapest way to make results repeatable.
        </p>
        <h3>Typical targets</h3>
        <ul>
          <li>Direct Neapolitan dough: 23–25 °C.</li>
          <li>Cold-fermented doughs (NY, balls straight into the fridge): 21–24 °C.</li>
          <li>Biga at end of mixing: 18–20 °C. Poolish: 20–22 °C.</li>
          <li>Final dough with biga/poolish: 24–26 °C.</li>
        </ul>
        <h3>What changes the water temperature</h3>
        <ul>
          <li><b>Flour and preferment temperature</b>: a biga straight from a 4 °C fridge needs much warmer water.</li>
          <li><b>Hydration heat</b>: dry flour releases heat when wetted — about <Delta sign="+" c={3} /> in a 65 % dough.</li>
          <li><b>Mixer heat</b>: hand kneading adds ~<Delta c={0.5} to={1} />, fork mixers ~<Delta c={1} to={2} />, spiral and planetary mixers ~<Delta c={3} to={5} />, food processors much more.</li>
        </ul>
        <h3>Ice</h3>
        <p>
          When the required water temperature is colder than your tap, replace part of the water with ice (weigh the ice
          as water). Melting 1 g of ice absorbs as much heat as cooling 1 g of water by <Delta c={80} />. The app computes the
          exact split. If even all-ice isn't enough, chill the flour (15–30 min in the freezer) or the preferment.
        </p>
        <h3>Measure</h3>
        <p>
          Use an instant-read probe in the middle of the dough right after mixing. If you're consistently off, run the{' '}
          <b>Mixer calibration</b> tool — it back-solves your mixer's heat from one real batch.
        </p>
      </>
    ),
  },
  {
    id: 'cold',
    title: 'Cold fermentation & tempering',
    emoji: '❄️',
    summary: 'Fridge temperatures, bulk vs balls, how long dough takes to chill, and when to take it out.',
    body: (
      <>
        <p>
          Cold fermentation slows yeast enough to stretch fermentation over days, building flavour, extensibility and
          browning. It also makes timing flexible — but only if you respect how slowly dough changes temperature.
        </p>
        <h3>Your fridge</h3>
        <ul>
          <li>Measure it: many fridges run 5–7 °C rather than the 3–4 °C on the dial, and the door is warmer.</li>
          <li>Every degree matters — a 6 °C fridge ferments roughly 30–40 % faster than a 3 °C one.</li>
        </ul>
        <h3>Chilling takes hours</h3>
        <ul>
          <li>250 g ball in a lidded container: ~3 h to get from 24 °C down to 8 °C.</li>
          <li>2 kg bulk in a tub: 7–9 h. Flatter, shallower containers chill faster.</li>
          <li>Pizza Weather simulates this, so plans with a short room phase and a long fridge phase get the right yeast.</li>
        </ul>
        <h3>Bulk or balls in the fridge?</h3>
        <ul>
          <li><b>Balls in the fridge</b> (after a short room bulk): best for timing and easy handling. Standard for NY style.</li>
          <li><b>Bulk in the fridge</b>, then ball: stronger, more developed dough; ball 4–8 h before baking so the balls relax.</li>
        </ul>
        <h3>Tempering (taking the chill off)</h3>
        <ul>
          <li>Cold dough is tight and tears. Balls need about 2–3 h at 20–24 °C to reach 13–16 °C and relax; 400 g+ balls take longer.</li>
          <li>Hot kitchen (28 °C+): 1–1.5 h can be enough — watch the dough, not the clock.</li>
          <li>The plan's last room-temperature phase is your tempering + final proof; the app includes it in the fermentation maths.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mixing',
    title: 'Mixing & kneading',
    emoji: '🥣',
    summary: 'Order of ingredients, hand vs machine, bassinage, windowpane, rests.',
    body: (
      <>
        <h3>Order of ingredients (direct dough)</h3>
        <ol>
          <li>Water (at the app's temperature) in the bowl; dissolve the salt (Neapolitan style) or keep it for later.</li>
          <li>Add ~10 % of the flour, then the yeast, then the remaining flour gradually.</li>
          <li>Mix until no dry flour remains, rest 10–20 min (the gluten develops by itself), then knead.</li>
          <li>Hold back 5–10 % of the water for high-hydration doughs and add it slowly at the end (bassinage).</li>
          <li>Oil last, once the dough is already strong.</li>
        </ol>
        <h3>By hand</h3>
        <p>
          10–15 minutes of kneading with a couple of short rests, or 3–4 sets of stretch-and-folds 15–30 min apart for
          wetter doughs. Stop when the dough is smooth and passes a decent windowpane.
        </p>
        <h3>Stand mixer (planetary)</h3>
        <p>
          Dough hook, low speed (1–2) for 3–4 min to combine, then medium-low (2–4) for 5–8 min. Watch the temperature —
          planetary mixers heat dough quickly. Don't overload (≤ 1 kg flour for most home mixers).
        </p>
        <h3>Spiral / fork mixers</h3>
        <p>
          Spiral: 3–5 min first speed + 4–8 min second speed. Fork: gentle, 15–20 min total, low heating — great for
          high-hydration and biga doughs.
        </p>
        <h3>Autolyse</h3>
        <p>
          Mix just the flour and water (hold back ~5 % of the water) and rest 20–45 minutes before adding salt, yeast
          and preferments. The flour hydrates and gluten forms on its own: less kneading, a more extensible dough — the
          classic trick for high hydration, whole grain and semola. With yeast already in, it's a “fermentolyse”.
          Long autolyses (hours) belong in the fridge and need strong flour.
        </p>
        <h3>Stretch & folds</h3>
        <p>
          For wet doughs, strength comes from folds instead of kneading: 3–4 sets 15–30 minutes apart in the first part
          of the bulk (teglia and pala 75–85 %: every 15–20 min; focaccia: every 30 min; canotto: 2–3 sets). Wet your
          hands, lift one side, fold it over, turn the bowl and repeat. The app puts each set in the timeline.
        </p>
        <h3>Done?</h3>
        <ul>
          <li>Smooth, slightly tacky, springs back slowly; thin translucent membrane when stretched (windowpane).</li>
          <li>Check the temperature: within <Delta sign="±" c={1} /> of the target is excellent.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'balling',
    title: 'Balling & proofing',
    emoji: '⚪',
    summary: 'Divide, shape, store, and read when the balls are ready.',
    body: (
      <>
        <h3>Divide & shape</h3>
        <ol>
          <li>Divide by weight (the app gives the exact ball weight including a small allowance for losses).</li>
          <li>Fold the edges into the middle, flip seam-side down, and tension the surface by dragging the ball towards you on the bench (Neapolitan "staglio" or pinch-and-tuck).</li>
          <li>Pinch the seam closed underneath. A tight, smooth skin holds gas and keeps its shape.</li>
        </ol>
        <h3>Store</h3>
        <ul>
          <li>Proofing boxes, lidded containers or individual deli tubs (lightly oiled for cold ferments).</li>
          <li>Leave space: balls roughly double in volume.</li>
        </ul>
        <h3>Ready to bake?</h3>
        <ul>
          <li>Relaxed and spread, about 1.5–2× the original volume, visible small bubbles under the skin.</li>
          <li><b>Poke test</b>: a gentle poke springs back slowly and leaves a slight dent. Snaps back instantly = under-proofed (needs time/warmth); doesn't spring back and deflates = over-proofed (bake soon, handle gently).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'flour',
    title: 'Flour strength (W)',
    emoji: '🌾',
    summary: 'Match flour strength to fermentation time; protein, W and absorption.',
    body: (
      <>
        <p>
          Italian flours are rated by <b>W</b> (alveograph strength). Stronger flours tolerate longer fermentation and
          more water. Pizza Weather converts your whole plan into "equivalent hours at 20 °C" and suggests a W range.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fermentation (≈ 20 °C)</th>
                <th>W</th>
                <th>Protein</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2–6 h</td>
                <td>170–220</td>
                <td>10–11 %</td>
              </tr>
              <tr>
                <td>6–12 h</td>
                <td>220–260</td>
                <td>11–12 %</td>
              </tr>
              <tr>
                <td>12–24 h</td>
                <td>260–310</td>
                <td>12–13 %</td>
              </tr>
              <tr>
                <td>24–48 h / biga</td>
                <td>300–350</td>
                <td>12.5–13.5 %</td>
              </tr>
              <tr>
                <td>48–72 h+ / long biga</td>
                <td>350–400</td>
                <td>13.5–15 %</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul>
          <li>US flours don't list W. All-purpose ≈ W 200–250, bread flour (12.7 %) ≈ W 280–320, high-gluten (14 %) ≈ W 350+.</li>
          <li>Whole-wheat and type 1/2 flours absorb more water — roughly +0.1 % hydration for every 1 % of wholemeal in the flour — and ferment 10–25 % faster (more enzymes and nutrients).</li>
          <li>Blending is fine: protein blends exactly by weight, and the W of a blend is roughly the weighted average (treat it as ±10–15 %). The app does both when you blend in a second flour.</li>
          <li>Semola rimacinata (re-milled durum) hydrates slowly: give it a 20–30 min autolyse or add the last water late.</li>
          <li>Italian protein figures are often minimums on a dry basis: 13 % “s.s.” is about 11 % as sold, so compare W, not protein, between Italian and US flours.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ovens',
    title: 'Baking by oven',
    emoji: '🔥',
    summary: 'Temperatures, bake times and formula tweaks for wood-fired, portable, electric and home ovens.',
    body: (
      <>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Oven</th>
                <th>Floor</th>
                <th>Bake</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Wood-fired</td>
                <td>430–485 °C</td>
                <td>60–90 s</td>
              </tr>
              <tr>
                <td>Portable gas (Ooni, Gozney…)</td>
                <td>400–480 °C</td>
                <td>60–120 s</td>
              </tr>
              <tr>
                <td>Electric pizza oven</td>
                <td>350–450 °C</td>
                <td>90 s – 3 min</td>
              </tr>
              <tr>
                <td>Home oven + steel</td>
                <td>260–300 °C</td>
                <td>5–8 min</td>
              </tr>
              <tr>
                <td>Home oven + stone</td>
                <td>250–290 °C</td>
                <td>7–10 min</td>
              </tr>
              <tr>
                <td>Home oven, pans</td>
                <td>230–260 °C</td>
                <td>12–20 min</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>Formula tweaks for lower temperatures</h3>
        <ul>
          <li>Below ~350 °C the crust needs help browning: 1–2 % sugar or 0.5–1 % diastatic malt, and 1–3 % oil for tenderness.</li>
          <li>Longer bakes dry the dough, so 63–70 % hydration works well in home ovens.</li>
          <li>Neapolitan formulas (no sugar/oil) are designed for 430 °C+ — in a home oven they bake pale and cracker-like.</li>
        </ul>
        <h3>Preheat</h3>
        <ul>
          <li>Stone/steel in a home oven: 45–60 min at max, then 5 min of broiler before launching.</li>
          <li>Portable ovens: 20–30 min; check the stone with an IR thermometer.</li>
          <li>Wood-fired: 1.5–2 h to saturate the floor.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    emoji: '🩺',
    summary: 'Tearing, slack dough, pale crust, gummy centres, over/under-proofing.',
    body: (
      <>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Symptom</th>
                <th>Likely cause → fix</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Tears when stretching</td>
                <td style={{ whiteSpace: 'normal' }}>Too cold or under-proofed → temper longer; weak flour for the schedule → stronger W.</td>
              </tr>
              <tr>
                <td>Snaps back, won't stretch</td>
                <td style={{ whiteSpace: 'normal' }}>Balled too recently or too cold → give it 30–60 min more; ball earlier next time.</td>
              </tr>
              <tr>
                <td>Slack, sticky, spreads flat</td>
                <td style={{ whiteSpace: 'normal' }}>Over-proofed or too warm → less yeast / lower FDT; hydration too high for the flour.</td>
              </tr>
              <tr>
                <td>Dense, few bubbles</td>
                <td style={{ whiteSpace: 'normal' }}>Under-fermented → more time or warmth; check yeast freshness.</td>
              </tr>
              <tr>
                <td>Pale crust</td>
                <td style={{ whiteSpace: 'normal' }}>Oven too cool for the formula → add malt/sugar; over-fermented dough has less sugar left.</td>
              </tr>
              <tr>
                <td>Burnt bottom, pale top</td>
                <td style={{ whiteSpace: 'normal' }}>Floor hotter than the dome → let the dome recover, turn the flame up, use the broiler.</td>
              </tr>
              <tr>
                <td>Gummy under the toppings</td>
                <td style={{ whiteSpace: 'normal' }}>Too much wet topping, under-baked, or dough too thick in the centre.</td>
              </tr>
              <tr>
                <td>Sour / alcoholic smell</td>
                <td style={{ whiteSpace: 'normal' }}>Over-fermented preferment or dough → shorten time or cut yeast 20–30 %.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'live',
    title: 'Follow your dough (live tracking)',
    emoji: '📡',
    summary: 'Measured dough temperature, the sample jar, and re-planning when life happens.',
    body: (
      <>
        <p>
          A forecast is only as good as its inputs. Once you start, tell the app what really happened and it
          re-forecasts from there — like a weather model taking in new observations.
        </p>
        <h3>1. Mark each mix</h3>
        <p>
          In the bake guide, tick the mixing step when you finish kneading. Enter the time and, ideally, the dough
          temperature from a probe in the middle of the dough. A dough <Delta c={2} /> warmer than planned can finish
          an hour or more early. The yeast amount is locked in from here and the forecast follows your dough.
        </p>
        <h3>2. The sample jar</h3>
        <p>
          Right after mixing, drop 20–40 g of dough into a straight-sided jar, press it flat and mark the level. It
          rises like the dough, but you can read it. 100 % rise means doubled — the model's end point.
        </p>
        <ul>
          <li>Two-stage doughs: ball after about 25–50 % rise in bulk.</li>
          <li>Neapolitan balls are ready at about 2× (100 %); canotto often 2.5–3×.</li>
          <li>Cold NY balls: about 1.5–2× once they have warmed up.</li>
          <li>Read it once it has risen 20–30 %: the first millimetres say little (the app ignores very early readings).</li>
        </ul>
        <h3>3. Plans changed?</h3>
        <p>
          Guests late, or dinner moved to tomorrow? Pick the new bake time and the app offers ways to land it: move the
          next step (into or out of the fridge), hold the dough at a steady temperature (fridge, a cool cellar, the oven
          with just the light on), or bake when it's ready. Every option is simulated — you see the ripeness each one
          gives at the bake.
        </p>
        <h3>The bake window</h3>
        <p>
          The forecast shows when the dough bakes well: roughly 85–130 % of the planned fermentation. Slow doughs
          (little yeast, long times) have a wide window; fast, warm doughs a narrow one. Room-temperature Neapolitan
          balls stay usable for hours; cold-fermented balls are fine for a day or two extra in the fridge, then warm up.
        </p>
      </>
    ),
  },
  {
    id: 'party',
    title: 'Pizza night: feeding a crowd',
    emoji: '🎉',
    summary: 'How many pizzas, toppings per pizza, oven pace, and staggering the balls.',
    body: (
      <>
        <h3>How many?</h3>
        <ul>
          <li>Neapolitan-style: one pizza per adult (250 g ball), half for kids; a spare never goes to waste.</li>
          <li>Shared pies: plan on ~200 g of dough per adult — an 18″ NY pie (≈ 560 g) feeds about three.</li>
          <li>Pan pizzas are filling: a 10×14″ Detroit feeds 2–3.</li>
        </ul>
        <h3>Toppings</h3>
        <p>
          AVPN Neapolitan: 60–80 g of tomato and 80–100 g of fior di latte per pizza, a few basil leaves and a thread of
          oil. US pizzerias load about 0.15 g of sauce and 0.2 g of cheese per cm² (≈ 170 g and 230 g on a 16″).
          Detroit takes ≈ 340 g of brick cheese per 10×14″ pan. The Pizza night tab scales all of it and writes the
          shopping list.
        </p>
        <h3>Oven pace</h3>
        <p>
          A wood or gas pizza oven turns out a pizza every 3–4 minutes if someone keeps stretching; a home oven with a
          steel needs 10–15 minutes per pizza including recovery (use the broiler in between). Plan the service length,
          not just the first pizza.
        </p>
        <h3>Stagger the balls</h3>
        <p>
          Cold balls need 2–4 hours to warm up. Take them out in waves, every 30 minutes, so the last ball gets the same
          warm-up as the first instead of sitting out for hours. The app lists the waves and checks how ripe the last
          pizza will be. Room-temperature balls just keep fermenting: move some to the fridge if the service is long.
        </p>
        <h3>Bake mode</h3>
        <p>A full-screen timer with turn beeps for fast ovens, pizza count and the take-out waves; the screen stays on.</p>
      </>
    ),
  },
  {
    id: 'calibrate',
    title: 'Calibrating to your kitchen',
    emoji: '🎯',
    summary: 'Mixer heat, yeast and starter calibration, the journal, altitude and night-time cooling.',
    body: (
      <>
        <p>Models start from averages. Five things make the forecast yours:</p>
        <h3>1. Mixer heat</h3>
        <p>Measure one batch (Tools → Mixer calibration): the app back-solves how much heat your mixer adds.</p>
        <h3>2. The journal</h3>
        <p>
          After each bake, log whether it was ready early or late and by how much. Each entry becomes the yeast
          calibration (or starter speed) that would have been right; after a few bakes the app suggests a value that
          fits your yeast, flour and kitchen.
        </p>
        <h3>3. Starter speed</h3>
        <p>
          Starters differ two- to three-fold. Feed yours 1 : 1 : 1, note when it peaks at a known temperature, and enter
          it in Settings: every sourdough timing then uses your starter's pace.
        </p>
        <h3>4. Altitude</h3>
        <p>
          Gas expands in thin air: at 1,500 m the same fermentation raises the dough ~20 % more, so the app cuts yeast
          and starter by the air-pressure ratio (≈ −17 % at 1,500 m) — in line with the 10–25 % rule of thumb.
        </p>
        <h3>5. Night-time cooling</h3>
        <p>
          Without heating or air-con a kitchen swings 2–5 degrees between late afternoon and dawn. Turn on “the room
          cools down at night” and the forecast follows the clock; long room-temperature doughs get noticeably more
          yeast when they ferment overnight.
        </p>
      </>
    ),
  },
]
