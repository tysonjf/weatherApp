import { formatNumber } from '../engine/units'
import { useSettings } from '../state/store'

/** A temperature difference in static copy, e.g. <Delta c={3} sign="+" /> → "+3 °C" or "+5.4 °F". */
export function Delta({ c, to, sign = '' }: { c: number; to?: number; sign?: string }) {
  const { tempUnit } = useSettings()
  const k = tempUnit === 'F' ? 1.8 : 1
  const n = (x: number) => formatNumber(x * k, x * k >= 10 ? 0 : 1)
  return (
    <>
      {sign}
      {n(c)}
      {to !== undefined && `–${n(to)}`} °{tempUnit}
    </>
  )
}
