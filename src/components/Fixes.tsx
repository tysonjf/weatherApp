import type { Recipe } from '../engine/types'
import type { BalanceFix } from '../engine/balance'
import { localizeTemps } from '../engine/units'
import { useSettings } from '../state/store'
import { Icon } from './Icon'

/** One-tap changes, each already checked with the model. */
export function FixButtons({ fixes, onApply }: { fixes: BalanceFix[]; onApply: (r: Recipe) => void }) {
  const { tempUnit: u } = useSettings()
  if (!fixes.length) return null
  return (
    <div className="fixes">
      {fixes.map((f) => (
        <button key={f.id} type="button" className="fix" onClick={() => onApply(f.recipe)}>
          <span className="fix-title">
            <Icon name="check" size={15} /> {f.title}
          </span>
          <span className="fix-detail">{localizeTemps(f.detail, u)}</span>
        </button>
      ))}
    </div>
  )
}
