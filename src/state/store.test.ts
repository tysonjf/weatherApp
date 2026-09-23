// @vitest-environment jsdom
/**
 * The app store: saving, duplicating and deleting recipes, bake-mode progress, the journal,
 * backups and what survives a reload.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { JournalEntry } from '../engine/calibration'
import { computeRecipe } from '../engine/compute'
import { markMixed } from '../engine/replan'
import { applyMethod, recipeFromStyle } from './recipes'
import { DEFAULT_SETTINGS } from './settings'
import { makeBackup, parseBackup, useStore } from './store'

const initial = useStore.getInitialState()
const store = () => useStore.getState()

function entry(id: string, patch: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    recipeId: 'r1',
    recipeName: 'Neapolitan',
    styleId: 'neapolitan',
    bakedAt: Date.UTC(2026, 5, 6, 17),
    createdAt: Date.UTC(2026, 5, 6, 20),
    rating: 4,
    proof: 'right',
    readyOffsetH: null,
    notes: '',
    plan: {
      leavening: 'yeast',
      eqHours21: 20,
      sdDoublings: 0,
      lastEnvC: 21,
      yeastScale: 1,
      starterSpeed: 1,
      hydration: 65,
      saltPct: 2.8,
      totalHours: 24,
      roomC: 21,
      yeastPct: 0.1,
      method: 'Direct',
    },
    ...patch,
  }
}

beforeEach(() => {
  localStorage.clear()
  useStore.setState(initial, true)
})

describe('recipes', () => {
  it('saves, stamps and deletes', () => {
    const r = recipeFromStyle('neapolitan')
    store().saveRecipe({ ...r, updatedAt: 0 })
    expect(store().recipes[r.id].updatedAt).toBeGreaterThan(0)
    store().toggleStep(r.id, 'final-mix')
    store().deleteRecipe(r.id)
    expect(store().recipes[r.id]).toBeUndefined()
    // Its bake-mode progress goes with it.
    expect(store().progress[r.id]).toBeUndefined()
  })

  it('duplicates as a fresh plan', () => {
    const r = applyMethod(recipeFromStyle('canotto'), 'biga', DEFAULT_SETTINGS)
    r.bakeAt = '2026-06-06T17:00:00.000Z'
    const bakeMs = Date.parse(r.bakeAt)
    const res = computeRecipe(r, { bakeAtMs: bakeMs })
    const biga = res.stages.find((s) => s.kind === 'preferment')!
    const live = markMixed(r, res, biga.id, bakeMs + biga.startH * 3600000, 18, bakeMs)
    store().saveRecipe(live)
    const id = store().duplicateRecipe(r.id)!
    const copy = store().recipes[id]
    expect(id).not.toBe(r.id)
    expect(copy.name).toBe(`${r.name} (copy)`)
    expect(copy.live).toBeUndefined()
    expect(copy.bakeAt).toBeNull()
    expect(copy.preferments[0].amountMode).toBe('auto')
    // The original keeps its live state.
    expect(store().recipes[r.id].live?.mixed[biga.id]).toBeDefined()
    expect(store().duplicateRecipe('nope')).toBeNull()
  })

  it('edits the draft only when there is one', () => {
    store().updateDraft((r) => ({ ...r, name: 'x' }))
    expect(store().draft).toBeNull()
    store().setDraft({ ...recipeFromStyle('ny'), updatedAt: 0 })
    store().updateDraft((r) => ({ ...r, hydration: 61 }))
    expect(store().draft!.hydration).toBe(61)
    expect(store().draft!.updatedAt).toBeGreaterThan(0)
  })
})

describe('bake-mode progress', () => {
  it('toggles steps and resets', () => {
    store().toggleStep('r1', 'a')
    store().toggleStep('r1', 'b')
    store().toggleStep('r1', 'a')
    expect(store().progress.r1).toEqual(['b'])
    store().resetProgress('r1')
    expect(store().progress.r1).toBeUndefined()
  })
})

describe('journal', () => {
  it('adds and deletes entries', () => {
    store().addJournal(entry('j1'))
    store().addJournal(entry('j2'))
    store().deleteJournal('j1')
    expect(store().journal.map((e) => e.id)).toEqual(['j2'])
  })
})

describe('backups', () => {
  it('merge in: the backup wins by id, junk is dropped, settings only when asked', () => {
    const mine = recipeFromStyle('neapolitan')
    const shared = recipeFromStyle('ny')
    store().saveRecipe(mine)
    store().saveRecipe(shared)
    store().addJournal(entry('j1', { notes: 'mine' }))
    store().addJournal(entry('j2'))
    store().setSettings({ roomC: 19 })

    const backup = parseBackup(
      JSON.parse(
        JSON.stringify({
          ...makeBackup({
            settings: { ...DEFAULT_SETTINGS, tempUnit: 'F' },
            recipes: { [shared.id]: { ...shared, name: 'NY from backup' }, broken: { hello: 1 } as never },
            journal: [entry('j1', { notes: 'backup' }), entry('j3'), { id: 7 } as never],
            progress: { [shared.id]: ['final-mix'] },
          }),
        }),
      ),
    )!
    expect(backup).not.toBeNull()

    const counts = store().importBackup(backup, false)
    expect(counts).toEqual({ recipes: 1, journal: 2 })
    expect(store().recipes[mine.id].name).toBe(mine.name)
    expect(store().recipes[shared.id].name).toBe('NY from backup')
    expect(store().recipes.broken).toBeUndefined()
    expect(store().journal.map((e) => [e.id, e.notes])).toEqual([
      ['j2', ''],
      ['j1', 'backup'],
      ['j3', ''],
    ])
    expect(store().progress[shared.id]).toEqual(['final-mix'])
    expect(store().settings.roomC).toBe(19)
    expect(store().settings.tempUnit).toBe('C')

    store().importBackup(backup, true)
    expect(store().settings.tempUnit).toBe('F')
    expect(store().settings.roomC).toBe(DEFAULT_SETTINGS.roomC)
  })

  it('fill in settings added after the backup was made', () => {
    const b = parseBackup({ app: 'pizza-weather', version: 1, recipes: {}, settings: { tempUnit: 'F' } })!
    expect(b.settings).toEqual({ ...DEFAULT_SETTINGS, tempUnit: 'F' })
    expect(b.journal).toEqual([])
    expect(b.progress).toEqual({})
    expect(parseBackup({ app: 'pizza-weather', recipes: null })).toBeNull()
    expect(parseBackup({ app: 'other', recipes: {} })).toBeNull()
    expect(parseBackup('pizza-weather')).toBeNull()
  })
})

describe('persistence', () => {
  it('writes everything to local storage', () => {
    const r = recipeFromStyle('detroit')
    store().saveRecipe(r)
    store().setSettings({ tempUnit: 'F' })
    const saved = JSON.parse(localStorage.getItem('pizza-weather')!)
    expect(saved.state.recipes[r.id].styleId).toBe('detroit')
    expect(saved.state.settings.tempUnit).toBe('F')
  })

  it('reloads old saves: migrates recipes, drops junk, fills in new settings', async () => {
    const r = recipeFromStyle('roman')
    const old = JSON.parse(JSON.stringify(r))
    delete old.final.autolyseMin
    delete old.kitchen.nightC
    localStorage.setItem(
      'pizza-weather',
      JSON.stringify({
        version: 1,
        state: {
          settings: { tempUnit: 'F', roomC: 24 },
          recipes: { [r.id]: old, junk: { nope: true } },
          journal: 'not a list',
          progress: {},
          draft: { ...old, id: 'draft-1' },
        },
      }),
    )
    await useStore.persist.rehydrate()
    const s = store()
    expect(Object.keys(s.recipes)).toEqual([r.id])
    expect(s.recipes[r.id].final.autolyseMin).toBe(0)
    expect(s.settings).toEqual({ ...DEFAULT_SETTINGS, tempUnit: 'F', roomC: 24 })
    expect(s.journal).toEqual([])
    expect(s.draft?.id).toBe('draft-1')
    expect(() => computeRecipe(s.recipes[r.id])).not.toThrow()
  })
})
