import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { localizeTemps, type TempUnit } from '../engine/units'

/** Rewrites absolute °C temperatures in static JSX (guides) for °F readers. */
export function localizeNode(node: ReactNode, unit: TempUnit): ReactNode {
  if (unit === 'C') return node
  if (typeof node === 'string') return localizeTemps(node, unit)
  if (Array.isArray(node)) return Children.map(node, (n) => localizeNode(n, unit))
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>
    if (el.props.children === undefined) return el
    return cloneElement(el, { children: Children.map(el.props.children, (n) => localizeNode(n, unit)) })
  }
  return node
}
