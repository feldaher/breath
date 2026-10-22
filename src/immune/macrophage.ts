// Alveolar macrophages: they crawl over the surface, take up virions, and fill with debris
// until they are exhausted and stop. The behaviour follows the PhysiCell coalition's rules
// 5.MPhi.1-10; the rates are ours (grade D).
//
// How many there are per alveolus is genuinely unsettled — 48 by Crapo's counts, about 29 by
// Hume et al. 2020, and mouse imaging says fewer than one. The tissue file uses the low end of
// the human range and says so on the card.

import type { ImmuneAgents, TissueSpec } from '../contracts';
import type { Acinus } from '../tissue/acinus';

export const AM = 0;

export interface MacrophageParams {
  /** How fast a macrophage clears the virions under it, per minute. */
  uptakePerMin: number;
  /** The surface a macrophage covers, µm². From Crapo's mean cell volume of 2,491 µm³. */
  footprintUm2: number;
  /** Debris at which it stops taking up (coalition rule 5.MPhi.10). */
  exhaustedAt: number;
  /** Chance per minute of moving to a neighbouring node. */
  moveChancePerMin: number;
  /**
   * A safety valve, not a rate: never take more than this share of a node in one step, so the
   * field cannot be driven negative. Normal clearance comes from the footprints, well below it.
   */
  maxNodeShare: number;
}

export const DEFAULT_MACROPHAGE: MacrophageParams = {
  uptakePerMin: 0.02,
  // A sphere of Crapo's 2,491 µm³ has radius 8.4 µm and so covers about 220 µm².
  footprintUm2: 220,
  exhaustedAt: 400,
  moveChancePerMin: 0.5,
  maxNodeShare: 0.9,
};

/** Resident macrophages, scattered over the alveoli they patrol. */
export function placeMacrophages(acinus: Acinus, spec: TissueSpec, r: () => number): ImmuneAgents {
  const per = Math.round(spec.resident.find((x) => x.kind === 'AM')?.perAlveolus.value ?? 0);
  const n = per * acinus.alveoli.length;
  const a: ImmuneAgents = {
    n,
    kind: new Uint8Array(n).fill(AM),
    tri: new Uint32Array(n),
    bary: new Float32Array(n * 3),
    load: new Float32Array(n),
    state: new Uint8Array(n),
  };
  let c = 0;
  for (const al of acinus.alveoli) {
    const [n0, n1] = al.nodes;
    for (let i = 0; i < per; i++) a.tri[c++] = n0 + Math.floor(r() * (n1 - n0));
  }
  return a;
}

/** Neighbour lists over the membrane's edges, built once. */
const neighbours = new WeakMap<Acinus, number[][]>();
function neighboursOf(acinus: Acinus): number[][] {
  let nb = neighbours.get(acinus);
  if (!nb) {
    nb = Array.from({ length: acinus.membrane.invMass.length }, () => [] as number[]);
    const e = acinus.membrane.edges;
    for (let k = 0; k < e.length; k += 2) { nb[e[k]].push(e[k + 1]); nb[e[k + 1]].push(e[k]); }
    neighbours.set(acinus, nb);
  }
  return nb;
}

/**
 * Macrophages crawl up the virion gradient and clear what they find, writing what they took into
 * `uptake` (per node, an amount, not a rate). An exhausted one stops.
 */
export function stepMacrophages(
  agents: ImmuneAgents,
  acinus: Acinus,
  virion: Float64Array,
  area: Float64Array,
  dtMin: number,
  p: MacrophageParams,
  r: () => number,
  uptake: Float64Array,
): void {
  uptake.fill(0);
  const nb = neighboursOf(acinus);
  const take = 1 - Math.exp(-p.uptakePerMin * dtMin);

  // Macrophages chemotax, so they pile onto whichever node has the virions. What limits them
  // there is that they cannot cover more of it than it has: the footprints on a node add up,
  // capped at the node's own area. Without that cap a crowd of them clears a node outright
  // every step, which would make a respiratory infection impossible to establish.
  const covered = new Float64Array(uptake.length);
  for (let i = 0; i < agents.n; i++) {
    if (agents.load[i] >= p.exhaustedAt) { agents.state[i] = 2; continue; }
    covered[agents.tri[i]] += p.footprintUm2;
  }
  for (let v = 0; v < uptake.length; v++) {
    if (covered[v] <= 0) continue;
    const share = Math.min(1, covered[v] / Math.max(1, area[v]));
    uptake[v] = Math.min(
      Math.max(0, virion[v]) * area[v] * share * take,
      Math.max(0, virion[v]) * area[v] * p.maxNodeShare,
    );
  }
  // Share out what the node actually gave, in proportion to each one's footprint.
  for (let i = 0; i < agents.n; i++) {
    const at = agents.tri[i];
    if (agents.load[i] >= p.exhaustedAt || covered[at] <= 0) continue;
    agents.load[i] += (uptake[at] * p.footprintUm2) / covered[at];
    agents.state[i] = 1;
  }

  // Crawl toward whichever neighbour has the most virions, now and then at random.
  for (let i = 0; i < agents.n; i++) {
    if (r() >= p.moveChancePerMin * dtMin) continue;
    const around = nb[agents.tri[i]];
    if (!around.length) continue;
    let best = around[Math.floor(r() * around.length)];
    if (r() < 0.75) {
      let bestV = -Infinity;
      for (const v of around) if (virion[v] > bestV) { bestV = virion[v]; best = v; }
    }
    agents.tri[i] = best;
  }
}
