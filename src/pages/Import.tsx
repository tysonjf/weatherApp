import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { TopBar } from '../components/Layout'
import { Alert } from '../components/ui'
import { Icon } from '../components/Icon'
import { decodeShared } from '../state/share'
import { useCompute } from '../state/hooks'
import { useSettings, useStore } from '../state/store'
import { styleById } from '../engine/presets'
import { formatHours, formatWeight } from '../engine/units'
import { uid } from '../engine/phases'

export function ImportPage() {
  const [params] = useSearchParams()
  const payload = params.get('r') ?? ''
  const recipe = useMemo(() => decodeShared(payload), [payload])
  const result = useCompute(recipe)
  const saveRecipe = useStore((s) => s.saveRecipe)
  const { weightUnit } = useSettings()
  const navigate = useNavigate()

  if (!recipe)
    return (
      <>
        <TopBar title="Import" back="/" />
        <main className="page">
          <Alert severity="error" title="That link doesn't contain a dough plan">
            It may have been cut off when it was copied.
          </Alert>
        </main>
      </>
    )

  const st = styleById(recipe.styleId)
  return (
    <>
      <TopBar title="Shared dough" back="/" />
      <main className="page stack">
        <div className="hero">
          <div className="muted small">
            {st.emoji} {st.name}
          </div>
          <h2 style={{ margin: '4px 0' }}>{recipe.name}</h2>
          {result && (
            <div className="muted small">
              {result.pieces} × {formatWeight(result.pieceWeight, weightUnit)} · {recipe.hydration}% hydration · {formatHours(result.totalHours)}
            </div>
          )}
        </div>
        <p className="muted">
          Someone shared this plan with you. Saving it adds a copy to your doughs — the kitchen temperatures are theirs,
          so check the Kitchen step before you start.
        </p>
        <button
          className="btn primary block"
          onClick={() => {
            const id = uid('r')
            saveRecipe({ ...recipe, id, createdAt: Date.now(), bakeAt: null })
            navigate(`/recipe/${id}`, { replace: true })
          }}
        >
          <Icon name="download" /> Save to my doughs
        </button>
      </main>
    </>
  )
}
