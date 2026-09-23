// @vitest-environment jsdom
/**
 * UI smoke tests: every page renders, the wizard makes a dough end to end, every style opens on
 * every tab, and none of it logs a React error (keys, updates during render, crashes).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { compressToEncodedURIComponent } from 'lz-string'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { JournalEntry } from './engine/calibration'
import { computeRecipe } from './engine/compute'
import { STYLES, scheduleById } from './engine/presets'
import type { Recipe } from './engine/types'
import { GUIDES } from './content/guides'
import { applyMethod, makePreferment, recipeFromStyle, type MethodPreset } from './state/recipes'
import { makePhase } from './engine/phases'
import { DEFAULT_SETTINGS } from './state/settings'
import { useStore } from './state/store'

const initial = useStore.getInitialState()
const TABS = ['Recipe', 'Forecast', 'Bake guide', 'Pizza night', 'Formula'] as const
const TAB_PARAM: Record<(typeof TABS)[number], string> = {
  Recipe: 'recipe',
  Forecast: 'forecast',
  'Bake guide': 'guide',
  'Pizza night': 'party',
  Formula: 'formula',
}

let errors: unknown[][] = []

beforeEach(() => {
  useStore.setState(initial, true)
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  expect(errors.map((e) => e.map(String).join(' ').slice(0, 300))).toEqual([])
})

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

/** A saved recipe baking a comfortable while from now, so it is neither late nor in progress. */
function saved(styleId: string, method?: MethodPreset, patch: Partial<Recipe> = {}): Recipe {
  let r = recipeFromStyle(styleId, useStore.getState().settings)
  if (method) r = applyMethod(r, method, useStore.getState().settings)
  const hours = computeRecipe(r).totalHours
  r = { ...r, bakeAt: new Date(Date.now() + (hours + 3) * 3600000).toISOString(), ...patch }
  useStore.getState().saveRecipe(r)
  return r
}

const tab = (name: string) => screen.getByRole('tab', { name })

describe('home', () => {
  it('invites a first dough', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Pizza Weather' })).toBeTruthy()
    expect(screen.getByText(/No doughs yet/)).toBeTruthy()
  })

  it('lists saved doughs and the journal', () => {
    const r = saved('neapolitan', 'biga', { name: 'Saturday pies' })
    useStore.getState().addJournal(journalEntry('j1', r))
    renderAt('/')
    const link = screen.getByRole('link', { name: /Saturday pies/ })
    expect(link.getAttribute('href')).toBe(`/recipe/${r.id}`)
    expect(link.textContent).toMatch(/Biga \d+%/)
    expect(screen.getByText(/1 bake logged/)).toBeTruthy()
  })

  it('sends unknown addresses home', () => {
    renderAt('/nowhere')
    expect(screen.getByRole('heading', { name: 'Pizza Weather' })).toBeTruthy()
  })
})

describe('new dough', () => {
  it('walks the wizard from a classic to a saved plan and opens every tab', () => {
    renderAt('/new')
    fireEvent.click(screen.getByRole('button', { name: /Biga \+ poolish/ }))
    // Straight to the dough step, with a live summary on top.
    expect(screen.getByText(/Step 2 of 8 · Size & formula/)).toBeTruthy()
    expect(screen.getByLabelText('Live summary').textContent).toMatch(/Dough.*Flour/)

    const labels: string[] = []
    for (let i = 0; i < 12; i++) {
      const next = screen.queryByRole('button', { name: /^Next:/ })
      if (!next) break
      labels.push(next.textContent!.replace('Next: ', '').trim())
      fireEvent.click(next)
    }
    // Both preferments get their own step.
    expect(labels).toEqual(['Method', 'Biga (1/2)', 'Poolish (2/2)', 'Fermentation & timing', 'Kitchen & water', 'Review'])

    fireEvent.click(screen.getByRole('button', { name: /Save & see the forecast/ }))
    const recipes = Object.values(useStore.getState().recipes)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].preferments.map((p) => p.type)).toEqual(['biga', 'poolish'])
    expect(recipes[0].bakeAt).not.toBeNull()
    expect(screen.getByRole('heading', { name: /^Bake / })).toBeTruthy()

    for (const name of [...TABS.slice(1), 'Recipe']) {
      fireEvent.click(tab(name))
      expect(tab(name).getAttribute('aria-selected')).toBe('true')
    }
  })

  it('edits numbers live', () => {
    useStore.getState().setDraft(recipeFromStyle('neapolitan'))
    renderAt('/wizard/dough')
    const before = screen.getByLabelText('Live summary').textContent
    fireEvent.change(screen.getByLabelText('Hydration'), { target: { value: '70' } })
    expect(useStore.getState().draft!.hydration).toBe(70)
    // Same dough, more water: less flour.
    expect(screen.getByLabelText('Live summary').textContent).not.toBe(before)
  })

  it('without a draft, the wizard goes back to the start', () => {
    renderAt('/wizard/dough')
    expect(screen.getByRole('heading', { name: 'Start from a classic' })).toBeTruthy()
  })
})

describe('a saved dough', () => {
  it('opens in the editor and saves back', () => {
    const r = saved('ny')
    renderAt(`/recipe/${r.id}`)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByText(`Edit · ${r.name}`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Next:/ }))
    fireEvent.change(screen.getByLabelText('Hydration'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useStore.getState().recipes[r.id].hydration).toBe(60)
    expect(screen.getByRole('heading', { name: /^Bake / })).toBeTruthy()
  })

  it('scales with the ball count', () => {
    const r = saved('neapolitan')
    const { container } = renderAt(`/recipe/${r.id}`)
    const dough = () => container.querySelector('.hero-stat .v')!.textContent
    const before = dough()
    fireEvent.change(screen.getByLabelText('Balls'), { target: { value: String(r.sizing.count * 2) } })
    expect(useStore.getState().recipes[r.id].sizing.count).toBe(r.sizing.count * 2)
    expect(parseFloat(dough()!)).toBeCloseTo(parseFloat(before!) * 2, -1)
  })

  it('duplicates and deletes from the menu', () => {
    const r = saved('detroit')
    renderAt(`/recipe/${r.id}`)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: /Duplicate/ }))
    expect(Object.keys(useStore.getState().recipes)).toHaveLength(2)
    expect(screen.getAllByText(`${r.name} (copy)`).length).toBeGreaterThan(0)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))
    expect(Object.keys(useStore.getState().recipes)).toEqual([r.id])
    expect(screen.getByRole('heading', { name: 'Pizza Weather' })).toBeTruthy()
  })

  it('logs a bake in the journal', () => {
    const r = saved('neapolitan')
    renderAt(`/recipe/${r.id}`)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: /Log a bake/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Over-proofed' }))
    fireEvent.click(screen.getByRole('button', { name: /Save to journal/ }))
    const j = useStore.getState().journal
    expect(j).toHaveLength(1)
    expect(j[0]).toMatchObject({ recipeId: r.id, recipeName: r.name, proof: 'over' })
  })

  it('goes live when you mark the dough mixed', () => {
    // Half-way through the plan: the mix was due hours ago.
    const base = recipeFromStyle('neapolitan')
    const hours = computeRecipe(base).totalHours
    const r = saved('neapolitan', undefined, { bakeAt: new Date(Date.now() + (hours / 2) * 3600000).toISOString() })
    const { container, unmount } = renderAt(`/recipe/${r.id}?tab=guide`)
    expect(screen.queryByText('● Live')).toBeNull()
    const mix = [...container.querySelectorAll('ol.steps > li')].find((li) => li.querySelector('.step-title')?.textContent === 'Mix the dough')!
    fireEvent.click(mix)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const live = useStore.getState().recipes[r.id].live
    expect(live?.mixed.final).toBeTypeOf('number')
    expect(screen.getByText('● Live')).toBeTruthy()
    expect(mix.className).toContain('done')
    unmount()
    // Home shows it in progress.
    renderAt('/')
    expect(screen.getByText('In progress')).toBeTruthy()
  })
})

describe('fixes and cold preferments', () => {
  /** The plan from the bug report: 50 % biga, 2 h room → 22 h fridge, cold balls 24 h, 24 °C kitchen. */
  function reportedPlan(): Recipe {
    const s = { ...useStore.getState().settings, roomC: 24 }
    const r = applyMethod(recipeFromStyle('canotto', s), 'biga', s)
    return {
      ...r,
      preferments: [{ ...makePreferment('biga', 50, s), phases: [makePhase('room', 2), makePhase('fridge', 22)] }],
      final: { ...r.final, phases: scheduleById('cold-balls-24').phases.map((p) => makePhase(p.location, p.hours, p.stage)) },
    }
  }

  it('offers one-tap fixes on the recipe and applying one clears the warning', () => {
    const r = reportedPlan()
    const hours = computeRecipe(r).totalHours
    saved('canotto', undefined, { ...r, id: r.id, bakeAt: new Date(Date.now() + (hours + 3) * 3600000).toISOString() })
    renderAt(`/recipe/${r.id}`)
    expect(screen.getByText('The preferments alone will over-ferment this dough')).toBeTruthy()
    const fixes = screen.getAllByRole('button', { name: /Room first, then the fridge/ })
    expect(fixes.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Smaller biga/ })).toBeTruthy()
    fireEvent.click(fixes[0])
    const biga = useStore.getState().recipes[r.id].preferments[0]
    expect(biga.phases.map((p) => p.location)).toEqual(['room', 'fridge'])
    expect(biga.phases[0].hours).toBeGreaterThan(8)
    expect(screen.queryByText('The preferments alone will over-ferment this dough')).toBeNull()
  })

  it('applies fixes to the draft in the wizard', () => {
    useStore.getState().setDraft(reportedPlan())
    renderAt('/wizard/review')
    fireEvent.click(screen.getByRole('button', { name: /Shorter final rise/ }))
    const d = useStore.getState().draft!
    expect(d.final.phases.reduce((t, p) => t + p.hours, 0)).toBeLessThan(24)
    expect(screen.queryByText('The preferments alone will over-ferment this dough')).toBeNull()
  })

  it('a fridge biga rests out of the fridge before the final mix, in the plan and the bake guide', () => {
    const r = reportedPlan()
    const hours = computeRecipe(r).totalHours
    saved('canotto', undefined, { ...r, id: r.id, bakeAt: new Date(Date.now() + (hours + 3) * 3600000).toISOString() })
    const { unmount } = renderAt(`/recipe/${r.id}?tab=guide`)
    expect(screen.getAllByText('Take the biga out of the fridge').length).toBeGreaterThan(0)
    unmount()
    renderAt(`/recipe/${r.id}?tab=forecast`)
    expect(screen.getAllByText('Take the biga out of the fridge').length).toBeGreaterThan(0)
  })

  it('the warmest water is a setting', () => {
    renderAt('/settings')
    fireEvent.change(screen.getByLabelText('Warmest water to use'), { target: { value: '27' } })
    expect(useStore.getState().settings.maxWaterC).toBe(27)
  })
})

describe('every style opens on every tab', () => {
  for (const st of STYLES)
    it(st.name, () => {
      const r = saved(st.id)
      for (const t of TABS) {
        const { unmount } = renderAt(`/recipe/${r.id}?tab=${TAB_PARAM[t]}`)
        expect(tab(t).getAttribute('aria-selected')).toBe('true')
        expect(screen.getByRole('heading', { name: /^Bake / })).toBeTruthy()
        expect(screen.queryByText('This recipe could not be calculated')).toBeNull()
        unmount()
      }
    })
})

describe('every leavening method opens on every tab', () => {
  for (const m of ['direct-sourdough', 'biga', 'poolish', 'biga-poolish', 'levain'] as const)
    it(m, () => {
      const r = saved('neapolitan', m)
      for (const t of TABS) {
        const { unmount } = renderAt(`/recipe/${r.id}?tab=${TAB_PARAM[t]}`)
        expect(tab(t).getAttribute('aria-selected')).toBe('true')
        unmount()
      }
    })
})

describe('Fahrenheit', () => {
  it('shows no Celsius anywhere on a recipe', () => {
    useStore.getState().setSettings({ tempUnit: 'F' })
    for (const m of ['direct', 'biga-poolish', 'levain'] as const) {
      const r = saved('canotto', m)
      let fahrenheit = 0
      for (const t of TABS) {
        const { container, unmount } = renderAt(`/recipe/${r.id}?tab=${TAB_PARAM[t]}`)
        expect(container.textContent, `${m} · ${t}`).not.toContain('°C')
        fahrenheit += container.textContent!.split('°F').length - 1
        unmount()
      }
      expect(fahrenheit, m).toBeGreaterThan(5)
    }
  })

  it('is switched on in settings', () => {
    renderAt('/settings')
    fireEvent.click(screen.getByRole('radio', { name: '°F' }))
    expect(useStore.getState().settings.tempUnit).toBe('F')
  })
})

describe('pizza night and bake mode', () => {
  it('suggests a ball count for the party and applies it', () => {
    const r = saved('neapolitan', undefined, { sizing: { ...recipeFromStyle('neapolitan').sizing, count: 4 } })
    renderAt(`/recipe/${r.id}?tab=party`)
    fireEvent.change(screen.getByLabelText('Adults'), { target: { value: '10' } })
    const make = screen.getByRole('button', { name: /^Make \d+$/ })
    const n = Number(make.textContent!.replace('Make ', ''))
    expect(n).toBeGreaterThan(4)
    fireEvent.click(make)
    expect(useStore.getState().recipes[r.id].sizing.count).toBe(n)
    expect(screen.getByText(/Shopping list/)).toBeTruthy()
  })

  it('times the pizzas one by one', () => {
    const r = saved('neapolitan', undefined, { sizing: { ...recipeFromStyle('neapolitan').sizing, count: 2 } })
    renderAt(`/recipe/${r.id}/bake`)
    expect(screen.getByText(/of 2/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /In the oven/ }))
    fireEvent.click(screen.getByRole('button', { name: /Out — next one/ }))
    fireEvent.click(screen.getByRole('button', { name: /In the oven/ }))
    fireEvent.click(screen.getByRole('button', { name: /Out — next one/ }))
    expect(screen.getByText(/All 2 baked/)).toBeTruthy()
  })
})

describe('sharing', () => {
  it('imports a shared plan', () => {
    const r = recipeFromStyle('ny')
    const payload = compressToEncodedURIComponent(JSON.stringify({ ...r, name: 'Shared NY' }))
    renderAt(`/import?r=${payload}`)
    expect(screen.getByRole('heading', { name: 'Shared NY' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Save to my doughs/ }))
    const recipes = Object.values(useStore.getState().recipes)
    expect(recipes.map((x) => x.name)).toEqual(['Shared NY'])
    expect(recipes[0].id).not.toBe(r.id)
  })

  it('explains a broken link', () => {
    renderAt('/import?r=garbage')
    expect(screen.getByText(/doesn't contain a dough plan/)).toBeTruthy()
  })
})

describe('tools', () => {
  it('lists every tool and each one opens', () => {
    renderAt('/tools')
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/tools/'))
    expect(links.length).toBeGreaterThanOrEqual(8)
    for (const href of links.map((a) => a.getAttribute('href')!)) {
      const { container, unmount } = renderAt(href)
      expect(container.querySelector('.topbar .title')?.textContent, href).toBeTruthy()
      expect(container.querySelector('main')?.textContent?.length, href).toBeGreaterThan(40)
      unmount()
    }
  })
})

describe('guides', () => {
  it('lists every guide and each one opens', () => {
    renderAt('/guides')
    for (const g of GUIDES) expect(screen.getAllByText(g.title).length).toBeGreaterThan(0)
    for (const g of GUIDES) {
      const { container, unmount } = renderAt(`/guides/${g.id}`)
      expect(container.textContent).toContain(g.title)
      unmount()
    }
  })
})

describe('journal', () => {
  it('is empty at first', () => {
    renderAt('/journal')
    expect(screen.getByText(/No bakes logged yet/)).toBeTruthy()
  })

  it('shows logged bakes', () => {
    const r = saved('neapolitan')
    useStore.getState().addJournal(journalEntry('j1', r, 'over'))
    useStore.getState().addJournal(journalEntry('j2', r, 'right'))
    const { container } = renderAt('/journal')
    expect(container.querySelectorAll('.journal-entry, .card').length).toBeGreaterThan(1)
    expect(container.textContent!.split(r.name).length - 1).toBeGreaterThanOrEqual(2)
  })
})

describe('settings', () => {
  it('renders every section', () => {
    const { container } = renderAt('/settings')
    for (const title of ['Your scale', 'Defaults for new doughs']) expect(container.textContent).toContain(title)
  })
})

function journalEntry(id: string, r: Recipe, proof: JournalEntry['proof'] = 'right'): JournalEntry {
  const res = computeRecipe(r)
  const f = res.stages.at(-1)!
  return {
    id,
    recipeId: r.id,
    recipeName: r.name,
    styleId: r.styleId,
    bakedAt: Date.now() - 86400000,
    createdAt: Date.now() - 80000000,
    rating: 4,
    proof,
    readyOffsetH: null,
    notes: '',
    plan: {
      leavening: 'yeast',
      eqHours21: f.clocks.eqHours21,
      sdDoublings: f.clocks.sdDoublings,
      lastEnvC: 21,
      yeastScale: DEFAULT_SETTINGS.yeastScale,
      starterSpeed: DEFAULT_SETTINGS.starterSpeed,
      hydration: r.hydration,
      saltPct: r.saltPct,
      totalHours: res.totalHours,
      roomC: r.kitchen.roomC,
      yeastPct: f.leavening.typePct,
      method: 'Direct',
    },
  }
}
