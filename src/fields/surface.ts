// Virions and interferon live on the sac's surface, which is where the lining fluid is
// (model spec §3). The same P1 finite elements as in the engine's volume solver, over the
// membrane's triangles, plus a coupling across every weld so a field can cross a septum from
// one alveolus to the next — without that the bubbles are separate components and nothing
// spreads.

import { createSurfaceFieldSolver } from '@feldaher/cell-engine/fields/fem';
import type { FieldSolver } from '@feldaher/cell-engine/contracts';
import type { Acinus } from '../tissue/acinus';
import type { FieldId, FieldSpec, TissueSpec } from '../contracts';

export interface Fields {
  solver: FieldSolver;
  /** Nodal concentrations, per µm² of surface. */
  c: Record<FieldId, Float64Array>;
  spec: Record<FieldId, FieldSpec>;
  /** Lumped nodal area, µm². */
  area: Float64Array;
}

/**
 * Welds are coincident nodes on two different bubbles. Rather than teach the solver about
 * conductances, we give it the welds as degenerate triangles: a triangle (i, j, k) whose nodes
 * are the weld's two nodes and a neighbour of one of them has a real area, so it conducts
 * between them exactly as any other element does. The area it adds is tiny against the sac's.
 */
function weldElements(acinus: Acinus): Uint32Array {
  const out: number[] = [];
  // A neighbour of i on its own bubble, so the element has some area to conduct over.
  const neighbour = new Map<number, number>();
  const e = acinus.membrane.edges;
  for (let k = 0; k < e.length; k += 2) {
    if (!neighbour.has(e[k])) neighbour.set(e[k], e[k + 1]);
    if (!neighbour.has(e[k + 1])) neighbour.set(e[k + 1], e[k]);
  }
  for (const w of acinus.welds) {
    const third = neighbour.get(w.i);
    if (third !== undefined && third !== w.j) out.push(w.i, w.j, third);
  }
  return Uint32Array.from(out);
}

export function makeFields(acinus: Acinus, spec: TissueSpec): Fields {
  const m = acinus.membrane;
  const tris = Uint32Array.from([...m.tris, ...weldElements(acinus)]);
  const solver = createSurfaceFieldSolver({ pos: m.pos, tris });
  solver.assemble(m);
  const c = {} as Record<FieldId, Float64Array>;
  const byId = {} as Record<FieldId, FieldSpec>;
  for (const f of spec.fields) {
    c[f.id] = new Float64Array(solver.nNodes);
    byId[f.id] = f;
  }
  return { solver, c, spec: byId, area: solver.mass() };
}

/**
 * One step of `dtMin` simulated minutes. `source` is per node, in amount per minute; the solver
 * wants amount per minute over the node's area, which is what the callers build.
 */
export function stepField(f: Fields, id: FieldId, dtMin: number, source?: Float64Array, clamp?: Map<number, number>): void {
  const s = f.spec[id];
  // Diffusion coefficients are quoted in µm²/s and the disease clock runs in minutes.
  f.solver.step(f.c[id], { D: s.D.value * 60, k: s.decay.value }, dtMin, source, clamp);
}

/** Total amount of a field over the whole surface. */
export function totalAmount(f: Fields, id: FieldId): number {
  let t = 0;
  const c = f.c[id], a = f.area;
  for (let i = 0; i < c.length; i++) t += c[i] * a[i];
  return t;
}

/** Re-assembles on the membrane's current shape, carrying amounts so stretching dilutes. */
export function refitFields(f: Fields, acinus: Acinus): void {
  f.solver.assemble(acinus.membrane, Object.values(f.c));
  f.area = f.solver.mass();
}
