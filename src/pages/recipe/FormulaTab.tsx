import { Fragment } from 'react'
import type { Recipe, RecipeResult } from '../../engine/types'
import { blendOf } from '../../engine/presets'
import { mixerById } from '../../engine/mixers'
import { formatHours, formatNumber, formatPct, formatTemp, formatTempDelta, formatWeight } from '../../engine/units'
import { YEAST_LABEL, yeastFromFresh } from '../../engine/yeastTypes'
import type { YeastType } from '../../engine/types'
import { useSettings } from '../../state/store'
import { SectionTitle } from '../../components/ui'

export function FormulaTab({ recipe, result }: { recipe: Recipe; result: RecipeResult }) {
  const { weightUnit: wu, tempUnit: u, yeastScale, starterSpeed, altitudeM } = useSettings()
  const t = result.totals
  const F = t.flour
  const rows: [string, number][] = [
    ['Flour', t.flour],
    ['Water', t.water],
    ['Salt', t.salt],
  ]
  if (t.oil > 0) rows.push(['Olive oil', t.oil])
  if (t.sugar > 0) rows.push(['Sugar', t.sugar])
  if (t.malt > 0) rows.push(['Diastatic malt', t.malt])
  if (t.honey > 0) rows.push(['Honey', t.honey])
  if (t.yeast > 0) rows.push([`${YEAST_LABEL[recipe.yeastType]}`, t.yeast])
  if (t.starter > 0) rows.push(['Ripe starter (incl. in flour & water)', t.starter])
  const flour = blendOf(recipe)
  const mixer = mixerById(recipe.kitchen.mixerId)
  const final = result.stages.find((s) => s.id === 'final')!
  const perLitre = (pct: number) => (1000 * pct) / recipe.hydration

  return (
    <div className="stack">
      <SectionTitle>Total formula</SectionTitle>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Weight</th>
              <th>Baker’s %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, g]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{formatWeight(g, wu)}</td>
                <td>{formatPct((g / F) * 100)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <b>Dough</b>
              </td>
              <td>
                <b>{formatWeight(t.dough, wu)}</b>
              </td>
              <td>
                <b>{formatPct((t.dough / F) * 100, 1)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <SectionTitle>Stages</SectionTitle>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Flour</th>
              <th>Water</th>
              <th>Hydr.</th>
              <th>Eq. h @{formatTemp(20, u, 0)}</th>
            </tr>
          </thead>
          <tbody>
            {result.stages.map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.kind === 'final' ? formatWeight(s.ingredients.find((l) => l.key === 'flour')?.grams ?? 0, wu) : formatWeight(s.flour, wu)}</td>
                <td>
                  {s.kind === 'final'
                    ? formatWeight(s.ingredients.filter((l) => l.kind === 'water' || l.kind === 'ice').reduce((a, l) => a + l.grams, 0), wu)
                    : formatWeight(s.water, wu)}
                </td>
                <td>{formatPct(s.hydration, 0)}</td>
                <td>{formatNumber(s.equivalentHours20, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Yeast, every way</SectionTitle>
      <div className="card">
        <div className="kv">
          {(['fresh', 'active-dry', 'instant'] as YeastType[]).map((y) => (
            <Fragment key={y}>
              <span>{YEAST_LABEL[y]}</span>
              <span>
                {formatWeight(yeastFromFresh(t.yeastFreshEq, y), wu)} · {formatPct(yeastFromFresh((t.yeastFreshEq / F) * 100, y))}
              </span>
            </Fragment>
          ))}
        </div>
      </div>

      <SectionTitle>Italian notation (per litre of water)</SectionTitle>
      <div className="card">
        <div className="kv">
          <span>Flour</span>
          <span>{formatNumber(100000 / recipe.hydration, 0)} g/L</span>
          <span>Salt</span>
          <span>{formatNumber(perLitre(recipe.saltPct), 1)} g/L</span>
          <span>Fresh yeast (total)</span>
          <span>{formatNumber(perLitre((t.yeastFreshEq / F) * 100), 2)} g/L</span>
        </div>
      </div>

      <SectionTitle>The model’s view</SectionTitle>
      <div className="card">
        <div className="kv">
          <span>Fermentation load (equivalent at {formatTemp(20, u, 0)})</span>
          <span>{formatHours(result.fermentationLoad20)}</span>
          <span>Recommended flour strength</span>
          <span>
            W {result.recommendedW.min}–{result.recommendedW.max}
          </span>
          <span>Your flour</span>
          <span>
            {flour.name} (W {flour.w[0]}–{flour.w[1]})
          </span>
          <span>Final dough ripeness at bake</span>
          <span>{Math.round(final.ripeness * 100)} %</span>
          <span>Proof target</span>
          <span>{formatNumber(recipe.final.proofTarget, 2)}× Craig’s end point</span>
          {yeastScale !== 1 && (
            <>
              <span>Your yeast calibration</span>
              <span>{Math.round(yeastScale * 100)} % (Settings)</span>
            </>
          )}
          {starterSpeed !== 1 && (
            <>
              <span>Your starter speed</span>
              <span>{Math.round(starterSpeed * 100)} % (Settings)</span>
            </>
          )}
          {altitudeM > 300 && (
            <>
              <span>Altitude</span>
              <span>{altitudeM} m (Settings)</span>
            </>
          )}
          <span>Mixer heat ({mixer.name})</span>
          <span>{formatTempDelta(final.waterPlan?.mixerRiseC ?? 0, u)}</span>
          {final.waterPlan && Number.isFinite(final.waterPlan.waterC) && (
            <>
              <span>Water (heat balance)</span>
              <span>{formatTemp(final.waterPlan.waterC, u)}</span>
              <span>Water (classic 3×/4× rule)</span>
              <span>{formatTemp(final.waterPlan.classicWaterC, u)}</span>
            </>
          )}
        </div>
      </div>
      <p className="muted small">
        Yeast: Craig’s pizzamaking.com fermentation chart (power-law fit), with Calcolapizza salt/fat/hydration terms,
        MasterBiga’s biga timing and the Italian poolish table. Sourdough: Craig’s sourdough chart. Temperatures: heat
        balance with flour hydration heat, plus simulated cooling/warming of the dough in each phase.
      </p>
    </div>
  )
}
