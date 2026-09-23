import { Icon } from './Icon'

/** 1–5 star rating; read-only when no onChange is given. */
export function Stars({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="stars" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={`star${n <= value ? ' on' : ''}`}
            onClick={() => onChange(n)}
          >
            <Icon name="star" size={size} />
          </button>
        ) : (
          <span key={n} className={`star${n <= value ? ' on' : ''}`}>
            <Icon name="star" size={size} />
          </span>
        ),
      )}
    </span>
  )
}
