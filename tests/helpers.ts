import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';
import { buildAcinus, type Acinus } from '../src/tissue/acinus';
import { makeBreathing, stepBreathing, DEFAULT_BREATHING, type Breathing, type BreathingParams } from '../src/mech/breathing';
import { cavityVolume } from '@feldaher/cell-engine/physics/cavity';
import type { TissueSpec } from '../src/contracts';

/** Meshing is the slow part, so each spacing is built once per test file. */
const cache = new Map<string, Acinus>();
export function sac(spacingUm = 14, nAlveoli?: number): Acinus {
  const key = `${spacingUm}:${nAlveoli ?? 'default'}`;
  let a = cache.get(key);
  if (!a) {
    a = buildAcinus(spec(nAlveoli), spacingUm);
    cache.set(key, a);
  }
  return a;
}

export function spec(nAlveoli?: number): TissueSpec {
  if (nAlveoli === undefined) return ALVEOLAR_SAC;
  return { ...ALVEOLAR_SAC, geometry: { ...ALVEOLAR_SAC.geometry, nAlveoli } as TissueSpec['geometry'] };
}

/** A fresh sac with its own membrane, so a test can deform it without disturbing the others. */
export function freshBreathing(spacingUm = 14, nAlveoli?: number, seed = 1): Breathing {
  return makeBreathing(buildAcinus(spec(nAlveoli), spacingUm), spec(nAlveoli), seed);
}

export const DT = 1 / 60;

/** Breathes for `breaths` whole breaths, calling `watch` after every frame. */
export function breathe(b: Breathing, breaths: number, p: BreathingParams = DEFAULT_BREATHING, watch?: (b: Breathing) => void) {
  const frames = Math.round((breaths * b.periodS) / DT);
  for (let f = 0; f < frames; f++) {
    stepBreathing(b, DT, p);
    watch?.(b);
  }
}

export const volumeOf = (b: Breathing, i: number) => cavityVolume(b.acinus.membrane.pos, b.acinus.alveoli[i].tris);

/** Union-find over the welds: how many separate pieces the sac is in. */
export function pieces(a: Acinus): number {
  const parent = a.alveoli.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const w of a.welds) parent[find(w.a)] = find(w.b);
  return new Set(a.alveoli.map((_, i) => find(i))).size;
}
