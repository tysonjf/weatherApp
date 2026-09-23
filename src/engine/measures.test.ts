import { describe, expect, it } from 'vitest'
import { dilutionNote, solutionGrams, teaspoons, tooSmallToWeigh } from './measures'

describe('small amounts', () => {
  it('turns grams into spoons', () => {
    expect(teaspoons('yeast', 3.1, 'instant')).toBe('≈ 1 tsp')
    expect(teaspoons('yeast', 0.78, 'instant')).toBe('≈ ¼ tsp')
    expect(teaspoons('yeast', 0.1, 'instant')).toBe('a small pinch')
    expect(teaspoons('yeast', 3, 'fresh')).toBeNull()
    expect(teaspoons('salt', 6, undefined)).toBe('≈ 1 tsp')
    expect(teaspoons('flour', 6, undefined)).toBeNull()
  })

  it('suggests a 1 % solution for yeast the scale cannot weigh', () => {
    expect(tooSmallToWeigh(0.21, 1)).toBe(true)
    expect(tooSmallToWeigh(0.21, 0.01)).toBe(false)
    expect(solutionGrams(0.21)).toBeCloseTo(21, 9)
    expect(dilutionNote(0.21, 'instant dry yeast')).toContain('use 21 g of that mix')
  })
})

import { makeBackup, parseBackup } from '../state/store'
import { DEFAULT_SETTINGS } from '../state/settings'

describe('backups', () => {
  it('round-trips and rejects foreign files', () => {
    const b = makeBackup({ settings: DEFAULT_SETTINGS, recipes: {}, journal: [], progress: {} })
    const back = parseBackup(JSON.parse(JSON.stringify(b)))
    expect(back?.app).toBe('pizza-weather')
    expect(parseBackup({ hello: 1 })).toBeNull()
    expect(parseBackup(null)).toBeNull()
  })
})
