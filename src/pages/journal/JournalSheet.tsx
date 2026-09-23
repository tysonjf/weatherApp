import { useState } from 'react'
import type { Recipe, RecipeResult } from '../../engine/types'
import { snapshotOf, type JournalEntry, type ProofOutcome } from '../../engine/calibration'
import { uid } from '../../engine/phases'
import { NumberField, Segmented } from '../../components/fields'
import { Sheet } from '../../components/ui'
import { Stars } from '../../components/Stars'
import { Icon } from '../../components/Icon'
import { methodLabel } from '../../state/recipes'
import { useSettings, useStore } from '../../state/store'

type When = 'early' | 'on-time' | 'late' | 'unknown'

/** How did the bake go? Saved to the journal, where it also teaches the calibration. */
export function JournalSheet({ recipe, result, bake, onClose }: { recipe: Recipe; result: RecipeResult; bake: Date; onClose: () => void }) {
  const settings = useSettings()
  const addJournal = useStore((s) => s.addJournal)
  const [rating, setRating] = useState(4)
  const [proof, setProof] = useState<ProofOutcome>('right')
  const [when, setWhen] = useState<When>('unknown')
  const [hours, setHours] = useState(1)
  const [notes, setNotes] = useState('')
  const save = () => {
    const entry: JournalEntry = {
      id: uid('j'),
      recipeId: recipe.id,
      recipeName: recipe.name,
      styleId: recipe.styleId,
      bakedAt: bake.getTime(),
      createdAt: Date.now(),
      rating,
      proof,
      readyOffsetH: when === 'unknown' ? null : when === 'on-time' ? 0 : when === 'early' ? -Math.abs(hours) : Math.abs(hours),
      notes: notes.trim(),
      plan: snapshotOf(recipe, result, { yeastScale: settings.yeastScale, starterSpeed: settings.starterSpeed }, methodLabel(recipe)),
    }
    addJournal(entry)
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="How did it go?">
      <div className="stack">
        <div className="field">
          <span className="label">Overall</span>
          <Stars value={rating} onChange={setRating} size={28} />
        </div>
        <div className="field">
          <span className="label">The dough at the bake</span>
          <Segmented
            ariaLabel="Proof"
            value={proof}
            onChange={setProof}
            options={[
              { value: 'under', label: 'Under-proofed' },
              { value: 'right', label: 'Just right' },
              { value: 'over', label: 'Over-proofed' },
            ]}
          />
        </div>
        <div className="field">
          <span className="label">It looked ready…</span>
          <Segmented
            ariaLabel="Ready"
            value={when}
            onChange={setWhen}
            options={[
              { value: 'early', label: 'Earlier' },
              { value: 'on-time', label: 'On time' },
              { value: 'late', label: 'Later' },
              { value: 'unknown', label: 'Not sure' },
            ]}
          />
        </div>
        {(when === 'early' || when === 'late') && (
          <NumberField
            label={when === 'early' ? 'How much earlier than planned?' : 'How much later than planned?'}
            value={hours}
            onChange={setHours}
            unit="h"
            step={0.25}
            min={0.25}
            max={12}
            decimals={2}
            hint="The single most useful thing for calibrating: it turns straight into a yeast or starter correction."
          />
        )}
        <div className="field">
          <label htmlFor="j-notes">Notes</label>
          <textarea
            id="j-notes"
            className="textbox"
            placeholder="Crumb, rim, flavour, what you’d change…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button className="btn primary block" onClick={save}>
          <Icon name="check" size={18} /> Save to journal
        </button>
      </div>
    </Sheet>
  )
}
