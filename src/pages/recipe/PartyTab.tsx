import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { PartySpec, Recipe, RecipeResult } from '../../engine/types'
import { DEFAULT_PARTY, ovenService, piecesFor, servicePlan, shoppingList, toppingProfile, toppingsPerPizza } from '../../engine/party'
import { BAKE_WINDOW } from '../../engine/fermentation'
import { formatHours, formatWeight } from '../../engine/units'
import { YEAST_LABEL } from '../../engine/yeastTypes'
import { NumberField, Segmented, Switch } from '../../components/fields'
import { Alert, SectionTitle } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useComputeOptions } from '../../state/hooks'
import { useSettings, useStore } from '../../state/store'
import { formatNear } from '../../lib/time'

const pct = (r: number) => `${Math.round(r * 100)} %`

export function PartyTab({ recipe, result, bake }: { recipe: Recipe; result: RecipeResult; bake: Date }) {
  const settings = useSettings()
  const saveRecipe = useStore((s) => s.saveRecipe)
  const opts = useComputeOptions(recipe)
  const wu = settings.weightUnit
  const party: PartySpec = { ...DEFAULT_PARTY, ...(recipe.party ?? {}) }
  const setParty = (patch: Partial<PartySpec>) => saveRecipe({ ...recipe, party: { ...party, ...patch } })
  const oven = ovenService(recipe.ovenId)
  const cadence = party.cadenceMin ?? oven.cadenceMin
  const pieces = result.pieces
  const suggested = piecesFor(recipe, result.pieceWeight, party)
  const noun = recipe.sizing.mode === 'pans' ? (pieces === 1 ? 'pan' : 'pans') : pieces === 1 ? 'pizza' : 'pizzas'
  const plan = useMemo(
    () => servicePlan(recipe, result, bake.getTime(), pieces, cadence, oven.capacity, opts),
    [recipe, result, bake, pieces, cadence, oven.capacity, opts],
  )
  const perPizza = toppingsPerPizza(recipe, result.pieceWeight)
  const profile = toppingProfile(recipe.styleId)
  const list = shoppingList(recipe, result, pieces, (g) => formatWeight(g, wu), YEAST_LABEL[recipe.yeastType])
  const [got, setGot] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const clock = (ms: number) => formatNear(new Date(ms), bake, settings.timeFormat)
  const shareList = async () => {
    const text = `${recipe.name} — shopping list\n` + list.map((l) => `• ${l.name}: ${l.amount}`).join('\n')
    try {
      if (navigator.share) await navigator.share({ title: `${recipe.name} shopping list`, text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="stack">
      <SectionTitle>Who’s coming</SectionTitle>
      <div className="card stack">
        <div className="grid-2">
          <NumberField label="Adults" value={party.adults} onChange={(adults) => setParty({ adults })} min={0} max={200} decimals={0} />
          <NumberField label="Kids" value={party.kids} onChange={(kids) => setParty({ kids })} min={0} max={200} decimals={0} />
        </div>
        <div className="field">
          <span className="label">Appetite</span>
          <Segmented
            ariaLabel="Appetite"
            value={party.appetite}
            onChange={(appetite) => setParty({ appetite })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'normal', label: 'Normal' },
              { value: 'hungry', label: 'Hungry' },
            ]}
          />
        </div>
        {recipe.sizing.mode === 'balls' && <Switch label="Make a spare" checked={party.spare} onChange={(spare) => setParty({ spare })} />}
        {suggested !== recipe.sizing.count ? (
          <div className="row between wrap">
            <span>
              Make <b>{suggested}</b> {recipe.sizing.mode === 'pans' ? 'pans' : 'balls'} (the plan has {recipe.sizing.count}).
            </span>
            <button className="btn primary sm" onClick={() => saveRecipe({ ...recipe, party, sizing: { ...recipe.sizing, count: suggested } })}>
              Make {suggested}
            </button>
          </div>
        ) : (
          <div className="muted small">
            ✓ {pieces} {noun}: right for {party.adults + party.kids} {party.adults + party.kids === 1 ? 'person' : 'people'}.
          </div>
        )}
      </div>

      <SectionTitle>The bake</SectionTitle>
      <div className="card stack">
        <NumberField
          label={oven.capacity > 1 ? `Minutes per round (${oven.capacity} at a time)` : 'Minutes per pizza'}
          value={cadence}
          onChange={(v) => setParty({ cadenceMin: v })}
          unit="min"
          step={1}
          min={1}
          max={60}
          decimals={0}
          hint="Stretch, top, bake and let the oven recover. Typical for your oven; change it to match your pace."
        />
        <div className="kv">
          <span>First {noun === 'pans' || noun === 'pan' ? 'pan' : 'pizza'} in</span>
          <span>{clock(plan.bakes[0])}</span>
          <span>Last one in</span>
          <span>{clock(plan.bakes[plan.bakes.length - 1])}</span>
          <span>All done by</span>
          <span>
            {clock(plan.endMs)} ({formatHours((plan.endMs - plan.bakes[0]) / 3600000)})
          </span>
          <span>Ripeness, first → last</span>
          <span>
            {pct(plan.firstRipeness)} → {pct(plan.lastRipeness)}
          </span>
        </div>
        {plan.lastRipeness > BAKE_WINDOW.max && (
          <Alert severity="warn" title="The last ones will be over-proofed">
            {plan.waves.length
              ? 'Take them out of the fridge later, or bake faster.'
              : 'Put some of the balls in the fridge after balling and take them out in waves, or bake faster.'}
          </Alert>
        )}
        {plan.waves.length > 0 && (
          <>
            <div className="small">
              <b>Take the balls out in waves</b> so each gets its {formatHours(plan.temperH)} to warm up:
            </div>
            <ul className="waves">
              {plan.waves.map((w) => (
                <li key={w.atMs}>
                  <b>{clock(w.atMs)}</b> — {w.count} ball{w.count > 1 ? 's' : ''}
                </li>
              ))}
            </ul>
          </>
        )}
        <Link to={`/recipe/${recipe.id}/bake`} className="btn primary block">
          <Icon name="timer" size={18} /> Start bake mode
        </Link>
      </div>

      {perPizza.length > 0 && (
        <>
          <SectionTitle>Toppings for {pieces}</SectionTitle>
          <div className="card">
            <ul className="ing-list">
              {perPizza.map((t) => (
                <li key={t.key}>
                  <span className="ing-icon" aria-hidden="true">
                    {t.kind === 'sauce' ? '🍅' : t.kind === 'cheese' ? '🧀' : t.kind === 'oil' ? '🫒' : '🌿'}
                  </span>
                  <span>
                    <div className="ing-name">{t.name}</div>
                    <div className="ing-note">{t.count !== undefined ? `${t.count} per pizza` : `${formatWeight(t.grams, wu)} per pizza`}</div>
                  </span>
                  <span className="ing-qty">{t.count !== undefined ? t.count * pieces : formatWeight(t.grams * pieces, wu)}</span>
                </li>
              ))}
            </ul>
          </div>
          {profile.sauceRecipe && <p className="muted small" style={{ margin: 0 }}>{profile.sauceRecipe}</p>}
        </>
      )}

      <SectionTitle>Shopping list</SectionTitle>
      <div className="card">
        <ul className="ing-list">
          {list.map((l) => (
            <li
              key={l.key}
              className={got.has(l.key) ? 'checked' : ''}
              style={{ cursor: 'pointer' }}
              onClick={() =>
                setGot((s) => {
                  const n = new Set(s)
                  if (n.has(l.key)) n.delete(l.key)
                  else n.add(l.key)
                  return n
                })
              }
            >
              <span className="ing-icon" aria-hidden="true">
                {got.has(l.key) ? '✓' : '🛒'}
              </span>
              <span>
                <div className="ing-name">{l.name}</div>
              </span>
              <span className="ing-qty" style={{ fontSize: '0.95rem' }}>
                {l.amount}
              </span>
            </li>
          ))}
        </ul>
        <button className="btn soft sm" style={{ marginTop: 10 }} onClick={shareList}>
          <Icon name="share" size={16} /> {copied ? 'Copied' : 'Share list'}
        </button>
      </div>
    </div>
  )
}
