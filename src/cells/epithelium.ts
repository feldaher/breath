// The alveolar epithelium: AT1 cells covering almost everything, AT2 cells dotted between them.
//
// A cell is a point on the surface with an area, not a patch of the mesh. Two reasons: an AT2
// cell is about 12 µm across while the mesh is coarser than that, so patches would give one
// triangle per cell at best; and this way the biology does not change when the mesh is refined.
//
// Sizes: the model alveolus is a sphere, and a sphere has 58 % of the surface of a real alveolus
// of the same volume (215,902 µm² implied by Crapo's cells, against 125,888 µm² for the sphere —
// real alveoli are polyhedra with deep septa). We keep the measured CELL COUNTS, which set how
// many infection events there are and the AT1:AT2 ratio, and draw each cell at 58 % of its
// measured area. The share of the surface each kind holds — 93.5 % AT1 — is preserved.

import { CellState, type Epithelium, type EpiKind, type TissueSpec } from '../contracts';
import { membraneArea } from '@feldaher/cell-engine/physics/membrane';
import type { Acinus } from '../tissue/acinus';

export const EPI_KINDS: EpiKind[] = ['AT1', 'AT2', 'ciliated', 'goblet', 'club', 'basal'];
export const kindId = (k: EpiKind): number => EPI_KINDS.indexOf(k);

/** A small deterministic generator, so the same sac always gets the same epithelium. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Lays an epithelium over the sac: for each alveolus, the counts the tissue asks for, spread
 * evenly over its bubble by a Fibonacci spiral with a little jitter so it does not look woven.
 */
export function placeEpithelium(acinus: Acinus, spec: TissueSpec, seed = 3): Epithelium {
  const r = rng(seed);
  const perAlveolus = spec.epithelium;
  const perBubble = perAlveolus.reduce((s, e) => s + Math.round(e.perAlveolus.value), 0);
  const n = perBubble * acinus.alveoli.length;

  const epi: Epithelium = {
    n,
    kind: new Uint8Array(n),
    state: new Uint8Array(n).fill(CellState.Healthy),
    timer: new Float32Array(n),
    prot: new Float32Array(n),
    areaUm2: new Float32Array(n),
    alveolus: new Uint16Array(n),
    centre: new Float32Array(n * 3),
    node: new Uint32Array(n),
    nodeCell: new Uint32Array(acinus.membrane.invMass.length),
  };

  // The share of surface each kind holds, from the measured areas × counts.
  const weight = perAlveolus.map((e) => Math.round(e.perAlveolus.value) * e.areaUm2.value);
  const totalWeight = weight.reduce((s, w) => s + w, 0);
  const bubbleArea = membraneArea(acinus.membrane) / acinus.alveoli.length;

  const golden = Math.PI * (3 - Math.sqrt(5));
  let c = 0;
  acinus.alveoli.forEach((al, ai) => {
    // Radius of this bubble, from its own nodes rather than assumed.
    const [n0, n1] = al.nodes;
    let radius = 0;
    for (let v = n0; v < n1; v++)
      radius += Math.hypot(
        acinus.membrane.pos[3 * v] - al.centre[0],
        acinus.membrane.pos[3 * v + 1] - al.centre[1],
        acinus.membrane.pos[3 * v + 2] - al.centre[2],
      ) / (n1 - n0);

    // Interleave the kinds along one spiral, so AT2 cells sit between AT1 cells rather than
    // in a band of their own.
    const order: number[] = [];
    perAlveolus.forEach((e, k) => { for (let i = 0; i < Math.round(e.perAlveolus.value); i++) order.push(k); });
    shuffle(order, r);

    order.forEach((k, i) => {
      const y = 1 - (2 * i + 1) / order.length;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * golden + 0.35 * (r() - 0.5);
      const jitter = 1 + 0.04 * (r() - 0.5);
      const p: [number, number, number] = [
        al.centre[0] + radius * rad * Math.cos(a) * jitter,
        al.centre[1] + radius * y * jitter,
        al.centre[2] + radius * rad * Math.sin(a) * jitter,
      ];
      epi.kind[c] = kindId(perAlveolus[k].kind);
      epi.alveolus[c] = ai;
      epi.centre.set(p, 3 * c);
      // Its share of this bubble's real area, keeping the measured split between the kinds.
      epi.areaUm2[c] = (bubbleArea * weight[k]) / totalWeight / Math.round(perAlveolus[k].perAlveolus.value);
      epi.node[c] = nearestNode(acinus, al.nodes, p);
      c++;
    });
  });

  // For drawing: which cell is nearest each node of the membrane.
  const m = acinus.membrane;
  acinus.alveoli.forEach((al, ai) => {
    const first = ai * perBubble;
    for (let v = al.nodes[0]; v < al.nodes[1]; v++) {
      let best = first, bestD = Infinity;
      for (let k = first; k < first + perBubble; k++) {
        const d = (m.pos[3 * v] - epi.centre[3 * k]) ** 2 + (m.pos[3 * v + 1] - epi.centre[3 * k + 1]) ** 2 + (m.pos[3 * v + 2] - epi.centre[3 * k + 2]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      epi.nodeCell[v] = best;
    }
  });

  return epi;
}

function shuffle(a: number[], r: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function nearestNode(acinus: Acinus, [n0, n1]: [number, number], p: [number, number, number]): number {
  const m = acinus.membrane;
  let best = n0, bestD = Infinity;
  for (let v = n0; v < n1; v++) {
    const d = (m.pos[3 * v] - p[0]) ** 2 + (m.pos[3 * v + 1] - p[1]) ** 2 + (m.pos[3 * v + 2] - p[2]) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

/** How much of the surface each kind holds, as a fraction. */
export function areaShare(epi: Epithelium): Map<number, number> {
  const by = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < epi.n; i++) {
    by.set(epi.kind[i], (by.get(epi.kind[i]) ?? 0) + epi.areaUm2[i]);
    total += epi.areaUm2[i];
  }
  for (const [k, v] of by) by.set(k, v / total);
  return by;
}
