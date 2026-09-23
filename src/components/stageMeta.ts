import type { StageResult } from '../engine/types'
import { prefermentPreset } from '../engine/presets'

export function stageEmoji(stage: StageResult): string {
  return stage.kind === 'final' ? '🍕' : stage.type ? prefermentPreset(stage.type).emoji : '🥣'
}

export function stageColorClass(stage: StageResult): string {
  if (stage.kind === 'final') return ''
  const c = stage.type ? prefermentPreset(stage.type).color : 'other'
  return `pref-${c}`
}
