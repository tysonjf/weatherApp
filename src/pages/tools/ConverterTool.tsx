import { Fragment, useState } from 'react'
import { TopBar } from '../../components/Layout'
import { NumberField, Segmented } from '../../components/fields'
import { Alert } from '../../components/ui'
import type { YeastType } from '../../engine/types'
import { formatNumber, formatWeight } from '../../engine/units'
import { YEAST_FACTOR, YEAST_LABEL, yeastFromFresh, yeastToFresh } from '../../engine/yeastTypes'
import { useSettings } from '../../state/store'

const TYPES: YeastType[] = ['fresh', 'active-dry', 'instant']
/** A 7 g sachet is 2¼ tsp. */
const G_PER_TSP_DRY = 7 / 2.25

function spoons(g: number): string {
  const tsp = g / G_PER_TSP_DRY
  if (tsp >= 0.9) return `≈ ${formatNumber(tsp, 1)} tsp`
  const fractions: [number, string][] = [
    [1 / 8, '⅛'],
    [1 / 4, '¼'],
    [1 / 3, '⅓'],
    [1 / 2, '½'],
    [2 / 3, '⅔'],
    [3 / 4, '¾'],
  ]
  let best = fractions[0]
  for (const f of fractions) if (Math.abs(f[0] - tsp) < Math.abs(best[0] - tsp)) best = f
  if (tsp < 1 / 16) return `less than ⅛ tsp — use the dilution trick`
  return `≈ ${best[1]} tsp`
}

export function ConverterTool() {
  const { yeastType, weightUnit } = useSettings()
  const [from, setFrom] = useState<YeastType>(yeastType)
  const [grams, setGrams] = useState(3)
  const fresh = yeastToFresh(grams, from)

  return (
    <>
      <TopBar title="Yeast converter" back="/tools" />
      <main className="page stack">
        <div className="card stack">
          <Segmented
            ariaLabel="Yeast type"
            value={from}
            onChange={setFrom}
            options={TYPES.map((t) => ({ value: t, label: YEAST_LABEL[t].replace(' yeast', '') }))}
          />
          <NumberField label="Amount" value={grams} onChange={setGrams} unit="g" step={0.1} min={0} max={1000} decimals={2} />
        </div>
        <div className="card">
          <div className="kv">
            {TYPES.map((t) => {
              const g = yeastFromFresh(fresh, t)
              return (
                <Fragment key={t}>
                  <span>
                    {YEAST_LABEL[t]}
                    {t !== 'fresh' && <div className="faint small">{spoons(g)}</div>}
                  </span>
                  <span>{formatWeight(g, weightUnit)}</span>
                </Fragment>
              )
            })}
          </div>
        </div>
        <Alert severity="tip" title="Weighing tiny amounts">
          Scales that read to 1 g can't weigh 0.15 g. Dissolve 1 g of yeast in 100 g of water, stir well and use 100 g of
          that solution for every 1 g of yeast you need (so {formatWeight(yeastFromFresh(fresh, from === 'fresh' ? 'fresh' : from))}{' '}
          → {formatNumber(yeastFromFresh(fresh, from) * 100, 0)} g of solution). Subtract the solution's water from the
          recipe's water.
        </Alert>
        <p className="muted small">
          Ratios used: fresh 1 : active dry {YEAST_FACTOR['active-dry']} : instant {formatNumber(YEAST_FACTOR.instant, 2)}.
          Active dry yeast is best dissolved in lukewarm water first; instant can go straight into the flour.
        </p>
      </main>
    </>
  )
}
