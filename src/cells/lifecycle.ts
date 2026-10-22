// What a virus does to one cell, as a pure state machine (model spec E11, E12), and the
// interferon response that can get in its way (E13).
//
// Healthy → Eclipse → Producing → Apoptotic → Dead, with Poisson-distributed durations. A dead
// AT1 cell leaves bare basement membrane behind — Denuded — which is what leaks and brings on
// the oedema.

import { CellState, type Epithelium, type PathogenSpec } from '../contracts';
import { EPI_KINDS } from './epithelium';

export interface LifecycleParams {
  pathogen: PathogenSpec;
  /** Multiplies the pathogen's production, for an antiviral. */
  productionScale: number;
  /** Multiplies the pathogen's infectivity, for a neutralising antibody. */
  infectivityScale: number;
}

export function defaultLifecycle(pathogen: PathogenSpec): LifecycleParams {
  return { pathogen, productionScale: 1, infectivityScale: 1 };
}

/** A Poisson-ish draw about a mean, never negative: the mean plus a spread of about 20 %. */
function aboutMean(mean: number, r: () => number): number {
  return Math.max(1, mean * (0.8 + 0.4 * r()));
}

/** Seeds an infection in the `count` cells nearest a point. */
export function seedInfection(epi: Epithelium, at: [number, number, number], count: number, p: PathogenSpec, r: () => number): number[] {
  const order = Array.from({ length: epi.n }, (_, i) => i).sort((a, b) => d2(epi, a, at) - d2(epi, b, at));
  const seeded: number[] = [];
  for (const i of order.slice(0, count)) {
    epi.state[i] = CellState.Eclipse;
    epi.timer[i] = aboutMean(p.eclipseMin.value, r);
    seeded.push(i);
  }
  return seeded;
}

const d2 = (e: Epithelium, i: number, p: [number, number, number]) =>
  (e.centre[3 * i] - p[0]) ** 2 + (e.centre[3 * i + 1] - p[1]) ** 2 + (e.centre[3 * i + 2] - p[2]) ** 2;

/**
 * Advances every cell by `dtMin` simulated minutes against the virion field, and returns how
 * many virions each node gained. `virion` is the nodal concentration per µm².
 */
export function stepCells(
  epi: Epithelium,
  virion: Float64Array,
  dtMin: number,
  lp: LifecycleParams,
  r: () => number,
  release: Float64Array,
): { infected: number; died: number } {
  const p = lp.pathogen;
  const beta = p.infectivity.value * lp.infectivityScale;
  const production = p.productionPerMin.value * lp.productionScale;
  let infected = 0, died = 0;
  release.fill(0);

  for (let i = 0; i < epi.n; i++) {
    const state = epi.state[i];
    if (state === CellState.Healthy) {
      const tropism = p.tropism[EPI_KINDS[epi.kind[i]]] ?? 0;
      if (tropism <= 0) continue;
      // E12: a hazard, so the probability stays in [0, 1) however big the step or the exposure.
      // Exposure is the virion concentration over the cell's own area.
      const exposure = Math.max(0, virion[epi.node[i]]) * epi.areaUm2[i];
      const hazard = beta * tropism * (1 - epi.prot[i] * p.ifnSensitivity.value) * exposure;
      if (r() < 1 - Math.exp(-hazard * dtMin)) {
        epi.state[i] = CellState.Eclipse;
        epi.timer[i] = aboutMean(p.eclipseMin.value, r);
        infected++;
      }
      continue;
    }
    if (state === CellState.Dead || state === CellState.Denuded) continue;

    if (state === CellState.Producing) release[epi.node[i]] += production * dtMin;

    epi.timer[i] -= dtMin;
    if (epi.timer[i] > 0) continue;
    switch (state) {
      case CellState.Eclipse:
        epi.state[i] = CellState.Producing;
        epi.timer[i] = aboutMean(p.producingMin.value, r);
        break;
      case CellState.Producing:
        epi.state[i] = CellState.Apoptotic;
        epi.timer[i] = aboutMean(p.apoptosisMin.value, r);
        break;
      case CellState.Apoptotic:
        // A dead AT1 leaves bare membrane; anything else is simply dead.
        epi.state[i] = EPI_KINDS[epi.kind[i]] === 'AT1' ? CellState.Denuded : CellState.Dead;
        died++;
        break;
    }
  }
  return { infected, died };
}

/** How far through its life a cell is, for drawing. */
export function isInfected(epi: Epithelium, i: number): boolean {
  const s = epi.state[i];
  return s === CellState.Eclipse || s === CellState.Producing || s === CellState.Apoptotic;
}

/** Fraction of an alveolus's AT1 area that is bare basement membrane (E15's driver). */
export function denudedFraction(epi: Epithelium, alveolus: number): number {
  let bare = 0, total = 0;
  for (let i = 0; i < epi.n; i++) {
    if (epi.alveolus[i] !== alveolus || EPI_KINDS[epi.kind[i]] !== 'AT1') continue;
    total += epi.areaUm2[i];
    if (epi.state[i] === CellState.Denuded) bare += epi.areaUm2[i];
  }
  return total > 0 ? bare / total : 0;
}

/** Fraction of an alveolus's cells of one kind that are still alive. */
export function aliveFraction(epi: Epithelium, alveolus: number, kind: string): number {
  let alive = 0, total = 0;
  for (let i = 0; i < epi.n; i++) {
    if (epi.alveolus[i] !== alveolus || EPI_KINDS[epi.kind[i]] !== kind) continue;
    total++;
    if (epi.state[i] !== CellState.Dead && epi.state[i] !== CellState.Denuded) alive++;
  }
  return total > 0 ? alive / total : 1;
}
