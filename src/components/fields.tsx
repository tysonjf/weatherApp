import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { cToF, deltaCToF, deltaFToC, fToC, roundTo } from '../engine/units'
import { useSettings } from '../state/store'

function parseNum(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (t === '' || t === '-' || t === '.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function fmt(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return ''
  const r = roundTo(value, Math.pow(10, -decimals))
  return String(r)
}

export interface NumberFieldProps {
  label?: ReactNode
  value: number
  onChange: (v: number) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  decimals?: number
  hint?: ReactNode
  steppers?: boolean
  disabled?: boolean
  ariaLabel?: string
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min = -Infinity,
  max = Infinity,
  decimals = 1,
  hint,
  steppers = true,
  disabled,
  ariaLabel,
}: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(() => fmt(value, decimals))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(fmt(value, decimals))
  }, [value, decimals])

  const parsed = parseNum(text)
  const invalid = parsed === null || parsed < min || parsed > max

  const commit = (n: number) => {
    const c = Math.min(max, Math.max(min, n))
    onChange(roundTo(c, Math.pow(10, -decimals)))
  }

  const bump = (dir: 1 | -1) => {
    const base = parseNum(text) ?? value
    // Snap to the step grid so repeated taps land on round numbers.
    const next = roundTo(Math.round((base + dir * step) / step) * step, Math.pow(10, -decimals))
    const c = Math.min(max, Math.max(min, next))
    setText(fmt(c, decimals))
    onChange(c)
  }

  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className={`numbox${invalid ? ' invalid' : ''}`}>
        {steppers && (
          <button type="button" aria-label="Decrease" onClick={() => bump(-1)} disabled={disabled}>
            <Icon name="minus" size={18} />
          </button>
        )}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          aria-label={ariaLabel}
          value={text}
          disabled={disabled}
          onFocus={(e) => {
            focused.current = true
            e.currentTarget.select()
          }}
          onBlur={() => {
            focused.current = false
            const n = parseNum(text)
            if (n === null) setText(fmt(value, decimals))
            else {
              const c = Math.min(max, Math.max(min, n))
              setText(fmt(c, decimals))
              if (c !== value) commit(c)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
          }}
          onChange={(e) => {
            setText(e.target.value)
            const n = parseNum(e.target.value)
            if (n !== null && n >= min && n <= max) commit(n)
          }}
        />
        {unit && <span className="unit">{unit}</span>}
        {steppers && (
          <button type="button" aria-label="Increase" onClick={() => bump(1)} disabled={disabled}>
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/** Temperature input: stores °C, displays in the user's unit. */
export function TempField({
  label,
  valueC,
  onChangeC,
  minC = -30,
  maxC = 60,
  hint,
  steppers = true,
}: {
  label?: ReactNode
  valueC: number
  onChangeC: (c: number) => void
  minC?: number
  maxC?: number
  hint?: ReactNode
  steppers?: boolean
}) {
  const { tempUnit } = useSettings()
  if (tempUnit === 'F') {
    return (
      <NumberField
        label={label}
        value={roundTo(cToF(valueC), 0.1)}
        onChange={(f) => onChangeC(roundTo(fToC(f), 0.01))}
        unit="°F"
        step={1}
        min={roundTo(cToF(minC), 1)}
        max={roundTo(cToF(maxC), 1)}
        decimals={1}
        hint={hint}
        steppers={steppers}
      />
    )
  }
  return (
    <NumberField
      label={label}
      value={valueC}
      onChange={onChangeC}
      unit="°C"
      step={0.5}
      min={minC}
      max={maxC}
      decimals={1}
      hint={hint}
      steppers={steppers}
    />
  )
}

/** Temperature *difference* input (e.g. mixer heat). */
export function TempDeltaField({
  label,
  valueC,
  onChangeC,
  hint,
  minC = 0,
  maxC = 25,
}: {
  label?: ReactNode
  valueC: number
  onChangeC: (c: number) => void
  hint?: ReactNode
  minC?: number
  maxC?: number
}) {
  const { tempUnit } = useSettings()
  if (tempUnit === 'F') {
    return (
      <NumberField
        label={label}
        value={roundTo(deltaCToF(valueC), 0.1)}
        onChange={(f) => onChangeC(roundTo(deltaFToC(f), 0.01))}
        unit="°F"
        step={1}
        min={roundTo(deltaCToF(minC), 1)}
        max={roundTo(deltaCToF(maxC), 1)}
        hint={hint}
      />
    )
  }
  return (
    <NumberField label={label} value={valueC} onChange={onChangeC} unit="°C" step={0.5} min={minC} max={maxC} hint={hint} />
  )
}

export interface SegOption<T extends string> {
  value: T
  label: ReactNode
  icon?: IconName
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  hint?: ReactNode
}) {
  return (
    <label className="switch">
      <span>
        <span style={{ fontWeight: 700 }}>{label}</span>
        {hint && <span className="field hint" style={{ display: 'block', marginTop: 2 }}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label?: ReactNode
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/** Weight input: stores grams, displays in the user's unit. */
export function WeightField({
  label,
  grams,
  onChange,
  step = 5,
  min = 0,
  max = 100000,
  hint,
}: {
  label?: ReactNode
  grams: number
  onChange: (g: number) => void
  step?: number
  min?: number
  max?: number
  hint?: ReactNode
}) {
  const { weightUnit } = useSettings()
  if (weightUnit === 'oz') {
    const OZ = 28.349523125
    return (
      <NumberField
        label={label}
        value={roundTo(grams / OZ, 0.01)}
        onChange={(oz) => onChange(roundTo(oz * OZ, 0.1))}
        unit="oz"
        step={0.25}
        min={min / OZ}
        max={max / OZ}
        decimals={2}
        hint={hint}
      />
    )
  }
  return <NumberField label={label} value={grams} onChange={onChange} unit="g" step={step} min={min} max={max} decimals={0} hint={hint} />
}

/** Length input: stores cm; shows inches when the user works in ounces. */
export function LengthField({
  label,
  cm,
  onChange,
  hint,
}: {
  label?: ReactNode
  cm: number
  onChange: (cm: number) => void
  hint?: ReactNode
}) {
  const { weightUnit } = useSettings()
  if (weightUnit === 'oz')
    return (
      <NumberField
        label={label}
        value={roundTo(cm / 2.54, 0.1)}
        onChange={(inch) => onChange(roundTo(inch * 2.54, 0.01))}
        unit="in"
        step={1}
        min={2}
        max={60}
        decimals={1}
        hint={hint}
      />
    )
  return <NumberField label={label} value={cm} onChange={onChange} unit="cm" step={1} min={5} max={150} decimals={1} hint={hint} />
}
