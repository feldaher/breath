// The interferon response (model spec E13). ENTIRELY OURS, grade D: no measured secretion rate
// or half-life for IFN-β from infected airway epithelium was found
// (outputs/literature/2026-10-20_lung-infection-parameters.md §5).
//
// What the literature does support, and all the game may claim, is the SHAPE: a few producing
// cells protect many neighbours by paracrine spread, protection saturates, it fades over hours
// once the signal goes, and the virus suppresses its production. The test asserts only that
// early interferon helps and late interferon does not.

import { CellState, type Epithelium, type PathogenSpec } from '../contracts';

export interface IfnParams {
  /** Units secreted per minute by a producing cell, before the pathogen's antagonism. */
  secretionPerMin: number;
  /** Concentration at which protection is half maximal. */
  halfMax: number;
  /** How long protection takes to follow the signal, minutes. */
  tauMin: number;
  /** Multiplies secretion: raised by giving interferon. */
  scale: number;
}

export const DEFAULT_IFN: IfnParams = {
  secretionPerMin: 0.02,
  halfMax: 0.02,
  tauMin: 180,
  scale: 1,
};

/** Interferon each node gains this step, written into `release`. */
export function secreteIfn(epi: Epithelium, p: PathogenSpec, ip: IfnParams, dtMin: number, release: Float64Array): void {
  release.fill(0);
  const rate = ip.secretionPerMin * ip.scale * (1 - p.ifnAntagonism.value);
  if (rate <= 0) return;
  for (let i = 0; i < epi.n; i++)
    if (epi.state[i] === CellState.Producing || epi.state[i] === CellState.Eclipse)
      release[epi.node[i]] += rate * dtMin;
}

/** Protection follows the local interferon with one lag and one half-max (E13). */
export function updateProtection(epi: Epithelium, ifn: Float64Array, ip: IfnParams, dtMin: number): void {
  const relax = 1 - Math.exp(-dtMin / ip.tauMin);
  for (let i = 0; i < epi.n; i++) {
    const c = Math.max(0, ifn[epi.node[i]]);
    const target = c / (c + ip.halfMax);
    epi.prot[i] += (target - epi.prot[i]) * relax;
  }
}
