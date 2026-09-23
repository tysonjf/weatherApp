import { Link } from 'react-router'
import { TopBar } from '../../components/Layout'
import { Icon } from '../../components/Icon'

const TOOLS = [
  {
    id: 'water',
    emoji: '🌡️',
    title: 'Water temperature',
    sub: 'Hit your final dough temperature — with ice when the tap is too warm.',
  },
  {
    id: 'yeast-time',
    emoji: '⏱️',
    title: 'Yeast ⇄ time predictor',
    sub: 'How much yeast for a schedule, or how long a given amount will take.',
  },
  {
    id: 'yeast-table',
    emoji: '🗺️',
    title: 'Yeast forecast table',
    sub: 'Heat map of yeast needed across hours and temperatures.',
  },
  {
    id: 'converter',
    emoji: '🔁',
    title: 'Yeast converter',
    sub: 'Fresh ⇄ active dry ⇄ instant, plus a trick for weighing tiny amounts.',
  },
  {
    id: 'calibrate',
    emoji: '🎯',
    title: 'Mixer calibration',
    sub: 'Measure one batch to learn how much heat your mixer adds.',
  },
  {
    id: 'pan',
    emoji: '📐',
    title: 'Pan & ball size',
    sub: 'Dough weight from pan size and thickness factor, or ball weight from diameter.',
  },
  {
    id: 'bakers',
    emoji: '⚖️',
    title: "Baker's percentages",
    sub: 'Turn any recipe in grams into percentages and hydration.',
  },
  {
    id: 'starter',
    emoji: '🫙',
    title: 'Starter feeding planner',
    sub: 'Pick a feeding ratio so your starter peaks exactly when you need it.',
  },
] as const

export function ToolsIndex() {
  return (
    <>
      <TopBar title="Tools" />
      <main className="page stack">
        <p className="muted">Standalone calculators for when you don't need a whole recipe.</p>
        <div className="stack-sm">
          {TOOLS.map((t) => (
            <Link key={t.id} to={`/tools/${t.id}`} className="recipe-item">
              <span className="ri-emoji">{t.emoji}</span>
              <span className="grow">
                <div className="ri-title">{t.title}</div>
                <div className="ri-sub">{t.sub}</div>
              </span>
              <Icon name="chevronRight" />
            </Link>
          ))}
        </div>
      </main>
    </>
  )
}
