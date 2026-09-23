import { Link, useNavigate } from 'react-router'
import { TopBar } from '../components/Layout'
import { Icon } from '../components/Icon'
import { STYLES, styleById } from '../engine/presets'
import { applyMethod, recipeFromStyle, type MethodPreset } from '../state/recipes'
import { useSettings, useStore } from '../state/store'

const QUICK: { label: string; emoji: string; style: string; method?: MethodPreset; sub: string }[] = [
  { label: 'Neapolitan, 24 h', emoji: '🍕', style: 'neapolitan', sub: 'Direct dough, room temperature, wood or gas oven' },
  { label: 'Canotto with biga', emoji: '🧱', style: 'canotto', method: 'biga', sub: '50 % biga, huge airy rims' },
  { label: 'Biga + poolish', emoji: '🫧', style: 'canotto', method: 'biga-poolish', sub: 'Two preferments, one dough' },
  { label: 'New York, 48 h cold', emoji: '🗽', style: 'ny', sub: 'Home oven with a steel' },
  { label: 'Sourdough Neapolitan', emoji: '🫙', style: 'neapolitan', method: 'direct-sourdough', sub: 'Natural leavening, 24 h' },
  { label: 'Detroit, same day', emoji: '🟥', style: 'detroit', sub: 'Pan pizza in about 5 hours' },
]

export function NewDoughPage() {
  const settings = useSettings()
  const draft = useStore((s) => s.draft)
  const recipes = useStore((s) => s.recipes)
  const setDraft = useStore((s) => s.setDraft)
  const navigate = useNavigate()

  const start = (styleId: string, method?: MethodPreset) => {
    let r = recipeFromStyle(styleId, settings)
    if (method) r = applyMethod(r, method, settings)
    setDraft(r)
    navigate('/wizard/dough')
  }

  return (
    <>
      <TopBar title="New dough" back="/" />
      <main className="page stack">
        {draft && !recipes[draft.id] && (
          <Link to="/wizard/style" className="recipe-item">
            <span className="ri-emoji">{styleById(draft.styleId).emoji}</span>
            <span className="grow">
              <div className="ri-title">Continue your draft</div>
              <div className="ri-sub">{draft.name}</div>
            </span>
            <Icon name="chevronRight" />
          </Link>
        )}
        <div>
          <h1>Start from a classic</h1>
          <p className="muted">One tap to a complete plan — then tweak every number in the steps that follow.</p>
        </div>
        <div className="tiles">
          {QUICK.map((q) => (
            <button key={q.label} type="button" className="tile" onClick={() => start(q.style, q.method)}>
              <span className="t-emoji">{q.emoji}</span>
              <span className="t-title">{q.label}</span>
              <span className="t-sub">{q.sub}</span>
            </button>
          ))}
        </div>
        <div className="section-title">Or pick a style</div>
        <div className="tiles">
          {STYLES.map((s) => (
            <button key={s.id} type="button" className="tile" onClick={() => start(s.id)}>
              <span className="t-emoji">{s.emoji}</span>
              <span className="t-title">{s.name}</span>
              <span className="t-sub">{s.blurb}</span>
            </button>
          ))}
        </div>
      </main>
    </>
  )
}
