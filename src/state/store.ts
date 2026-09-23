import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Recipe } from '../engine/types'
import type { JournalEntry } from '../engine/calibration'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { migrateRecipe } from './recipes'
import { uid } from '../engine/phases'

interface AppState {
  settings: Settings
  recipes: Record<string, Recipe>
  /** The recipe currently being edited in the wizard. */
  draft: Recipe | null
  /** Bake-mode progress: recipeId → set of completed step keys. */
  progress: Record<string, string[]>
  /** Bake journal, newest last. */
  journal: JournalEntry[]
  addJournal: (e: JournalEntry) => void
  deleteJournal: (id: string) => void
  setSettings: (patch: Partial<Settings>) => void
  setDraft: (recipe: Recipe | null) => void
  updateDraft: (fn: (r: Recipe) => Recipe) => void
  saveRecipe: (recipe: Recipe) => void
  deleteRecipe: (id: string) => void
  duplicateRecipe: (id: string) => string | null
  toggleStep: (recipeId: string, key: string) => void
  resetProgress: (recipeId: string) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      recipes: {},
      draft: null,
      progress: {},
      journal: [],
      addJournal: (e) => set((s) => ({ journal: [...s.journal, e] })),
      deleteJournal: (id) => set((s) => ({ journal: s.journal.filter((e) => e.id !== id) })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setDraft: (recipe) => set({ draft: recipe }),
      updateDraft: (fn) =>
        set((s) => (s.draft ? { draft: { ...fn(s.draft), updatedAt: Date.now() } } : {})),
      saveRecipe: (recipe) =>
        set((s) => ({ recipes: { ...s.recipes, [recipe.id]: { ...recipe, updatedAt: Date.now() } } })),
      deleteRecipe: (id) =>
        set((s) => {
          const recipes = { ...s.recipes }
          delete recipes[id]
          const progress = { ...s.progress }
          delete progress[id]
          return { recipes, progress }
        }),
      duplicateRecipe: (id) => {
        const src = get().recipes[id]
        if (!src) return null
        const copy: Recipe = {
          ...structuredClone(src),
          id: uid('r'),
          name: `${src.name} (copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({ recipes: { ...s.recipes, [copy.id]: copy } }))
        return copy.id
      },
      toggleStep: (recipeId, key) =>
        set((s) => {
          const cur = new Set(s.progress[recipeId] ?? [])
          if (cur.has(key)) cur.delete(key)
          else cur.add(key)
          return { progress: { ...s.progress, [recipeId]: [...cur] } }
        }),
      resetProgress: (recipeId) =>
        set((s) => {
          const progress = { ...s.progress }
          delete progress[recipeId]
          return { progress }
        }),
    }),
    {
      name: 'pizza-weather',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        const recipes: Record<string, Recipe> = {}
        for (const [id, r] of Object.entries(p.recipes ?? {})) {
          const m = migrateRecipe(r)
          if (m) recipes[id] = m
        }
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          recipes,
          journal: Array.isArray(p.journal) ? p.journal : [],
          draft: p.draft ? migrateRecipe(p.draft) : null,
        }
      },
    },
  ),
)

export const useSettings = (): Settings => useStore((s) => s.settings)
