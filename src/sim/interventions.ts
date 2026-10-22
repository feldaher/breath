// Giving a dose, and what it is still doing an hour or a day later. An intervention rises over
// its onset and falls with its half-life; its effect on the model is recomputed from scratch
// every step from the doses given so far, so a run replays exactly from its list of actions.

import { INTERVENTIONS, intervention } from '../data/interventions';
import type { Action, ModTarget } from '../contracts';
import type { World } from './world';

/** How much of a dose is active at `tMin`, 0 before it was given. */
export function activity(a: Action, tMin: number): number {
  const spec = intervention(a.id);
  const since = tMin - a.tMin;
  if (since < 0) return 0;
  const rise = 1 - Math.exp(-since / Math.max(1, spec.onsetMin));
  const fall = spec.halfLifeMin ? Math.exp((-Math.LN2 * since) / spec.halfLifeMin) : 1;
  return a.dose * rise * fall;
}

/** The total pull on each target right now. */
export function effectsAt(actions: Action[], tMin: number): Map<ModTarget, { mul: number; add: number }> {
  const out = new Map<ModTarget, { mul: number; add: number }>();
  for (const a of actions) {
    const act = activity(a, tMin);
    if (act <= 0) continue;
    for (const e of intervention(a.id).effects) {
      const cur = out.get(e.target) ?? { mul: 1, add: 0 };
      if (e.op === 'mul') cur.mul *= Math.max(0, 1 - e.perDose * act);
      else cur.add += e.perDose * act;
      out.set(e.target, cur);
    }
  }
  return out;
}

/** Writes the current effects into the world's parameters. Call once per disease step. */
export function applyInterventions(w: World, actions: Action[]): void {
  const e = effectsAt(actions, w.tMin);
  w.lifecycle.productionScale = e.get('production')?.mul ?? 1;
  w.lifecycle.infectivityScale = e.get('infectivity')?.mul ?? 1;
  w.ifn.scale = 1 + (e.get('ifnLevel')?.add ?? 0);
  w.peep = e.get('peep')?.add ?? 0;
}

export const INTERVENTION_IDS = INTERVENTIONS.map((i) => i.id);
