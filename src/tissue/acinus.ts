// The acinus: a cluster of alveoli, each a closed membrane bubble, welded to its neighbours
// where they touch. The welds are the shared septa, and they do two jobs at once: mechanically
// they make the sac one body, so an alveolus that collapses pulls on its neighbours (alveolar
// interdependence); and they are the path a field takes from one alveolus to the next.
//
// Each bubble is closed by construction, so its volume (model spec E1) and its breathing
// constraint are exact. That is why this is built from spheres rather than carved out of a
// signed distance field: see outputs/design/2026-10-20_architecture.md, "Measured 2026-10-20".

import { icosphereDepth, icosphereForVolume, mergeTriMeshes, type TriMesh } from '@feldaher/cell-engine/mesh/icosphere';
import { makeMembrane, type Membrane } from '@feldaher/cell-engine/physics/membrane';
import { cavityVolume, type Cavity } from '@feldaher/cell-engine/physics/cavity';
import type { Vec3 } from '@feldaher/cell-engine/contracts';
import type { TissueSpec } from '../contracts';

export interface AcinusPlan {
  /** Alveolus centres in rest space. */
  centres: Vec3[];
  /** Radius of each bubble, set so the mesh encloses the measured alveolar volume. */
  radiusUm: number;
  /** Volume each bubble encloses. */
  volumeUm3: number;
  /** Subdivision depth of each bubble. */
  depth: number;
  /** How far the centres sit from the middle of the sac. */
  clusterRadiusUm: number;
}

export interface Alveolus {
  centre: Vec3;
  /** Node indices of this bubble in the merged mesh: [start, end). */
  nodes: [number, number];
  /** Its closed surface, indexing the merged mesh. */
  tris: Uint32Array;
  restVolumeUm3: number;
}

export interface Weld {
  i: number;
  j: number;
  /** The two alveoli this weld joins. */
  a: number;
  b: number;
}

export interface Acinus {
  plan: AcinusPlan;
  membrane: Membrane;
  alveoli: Alveolus[];
  cavities: Cavity[];
  /**
   * Welded node pairs between touching alveoli. They are already among the membrane's stretch
   * constraints; the fields use the same pairs as couplings.
   */
  welds: Weld[];
}

/**
 * Centres on a Fibonacci sphere: the alveoli spread evenly around a central space, the way a sac
 * opens off an alveolar duct. They are placed close enough to overlap, so neighbours share a
 * septum rather than floating apart.
 */
/**
 * How far a typical alveolus sits from its nearest neighbour, in radii. Under 2 the bubbles
 * overlap, which is how they come to share a flat septum rather than kissing at a point — real
 * alveoli in a sac are packed polyhedra, not loose spheres.
 */
const NEIGHBOUR_GAP = 1.45;

/** `n` points spread evenly over the unit sphere. */
function fibonacciSphere(n: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * golden;
    out.push([r * Math.cos(a), y, r * Math.sin(a)]);
  }
  return out;
}

export function planAcinus(spec: TissueSpec, spacingUm = 12): AcinusPlan {
  const geo = spec.geometry;
  if (geo.kind !== 'acinus') throw new Error(`not an acinus: ${geo.kind}`);
  const n = geo.nAlveoli;
  const R = geo.alveolusRadiusUm.value;
  const volume = (4 / 3) * Math.PI * R ** 3;
  const depth = icosphereDepth(R, spacingUm);
  const unit = fibonacciSphere(n);
  // Scale the cluster so that a TYPICAL alveolus sits NEIGHBOUR_GAP radii from its nearest
  // neighbour: just inside touching, so most near pairs overlap in a lens the size of a septum
  // and can be welded. Scaling on the single closest pair instead would spread the rest apart.
  let meanNearest = 0;
  for (let i = 0; i < n; i++) {
    let nearest = Infinity;
    for (let j = 0; j < n; j++) if (j !== i)
      nearest = Math.min(nearest, Math.hypot(unit[i][0] - unit[j][0], unit[i][1] - unit[j][1], unit[i][2] - unit[j][2]));
    meanNearest += nearest / n;
  }
  const cluster = n <= 1 ? 0 : (NEIGHBOUR_GAP * R) / meanNearest;
  const centres: Vec3[] = unit.map((u) => [cluster * u[0], cluster * u[1], cluster * u[2]] as Vec3);
  return { centres, radiusUm: R, volumeUm3: volume, depth, clusterRadiusUm: cluster };
}

/**
 * Builds the sac. `spacingUm` is the edge length the bubbles are meshed at; `weldUm` is how close
 * two nodes of different alveoli must be before they are welded into a septum.
 */
export function buildAcinus(spec: TissueSpec, spacingUm = 12, weldUm?: number): Acinus {
  const plan = planAcinus(spec, spacingUm);
  // A geometric reach, not a mesh-dependent one, so refining the mesh does not change the
  // physics; widened only if the mesh is too coarse to have node pairs that close.
  const reach = weldUm ?? Math.max(0.18 * plan.radiusUm, 1.2 * spacingUm);
  const parts: TriMesh[] = plan.centres.map((c) => icosphereForVolume(c, plan.volumeUm3, plan.depth));
  const merged = mergeTriMeshes(parts);
  const membrane = makeMembrane(merged);

  const alveoli: Alveolus[] = [];
  let node = 0, tri = 0;
  parts.forEach((p, i) => {
    const nv = p.pos.length / 3, nt = p.tris.length;
    alveoli.push({
      centre: plan.centres[i],
      nodes: [node, node + nv],
      tris: membrane.tris.subarray(tri, tri + nt),
      restVolumeUm3: 0,
    });
    node += nv; tri += nt;
  });
  for (const a of alveoli) a.restVolumeUm3 = cavityVolume(membrane.pos, a.tris);

  const welds = findWelds(membrane, alveoli, reach);
  // The welds are the septa: held as stretch constraints alongside each bubble's own edges.
  const extra = welds.flatMap((w) => [w.i, w.j]);
  const extraLen = welds.map((w) => Math.hypot(
    membrane.pos[3 * w.i] - membrane.pos[3 * w.j],
    membrane.pos[3 * w.i + 1] - membrane.pos[3 * w.j + 1],
    membrane.pos[3 * w.i + 2] - membrane.pos[3 * w.j + 2],
  ));
  membrane.edges = Uint32Array.from([...membrane.edges, ...extra]);
  membrane.restLen = Float32Array.from([...membrane.restLen, ...extraLen]);

  const cavities: Cavity[] = alveoli.map((a) => ({ tris: a.tris, target: a.restVolumeUm3, compliance: 0, lambda: 0 }));
  return { plan, membrane, alveoli, cavities, welds };
}

/** Nearest-neighbour pairs between different alveoli, closer than `weldUm`, each node used once. */
function findWelds(m: Membrane, alveoli: Alveolus[], weldUm: number): Weld[] {
  const welds: Weld[] = [];
  const taken = new Uint8Array(m.invMass.length);
  const cell = Math.max(weldUm, 1);
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  const owner = new Int32Array(m.invMass.length).fill(-1);
  alveoli.forEach((a, ai) => {
    for (let v = a.nodes[0]; v < a.nodes[1]; v++) {
      owner[v] = ai;
      const k = key(m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]);
      const list = grid.get(k);
      if (list) list.push(v); else grid.set(k, [v]);
    }
  });
  for (let v = 0; v < owner.length; v++) {
    if (taken[v]) continue;
    const x = m.pos[3 * v], y = m.pos[3 * v + 1], z = m.pos[3 * v + 2];
    let best = -1, bestD = weldUm;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const list = grid.get(key(x + i * cell, y + j * cell, z + k * cell));
      if (!list) continue;
      for (const u of list) {
        if (u === v || taken[u] || owner[u] === owner[v]) continue;
        const d = Math.hypot(x - m.pos[3 * u], y - m.pos[3 * u + 1], z - m.pos[3 * u + 2]);
        if (d < bestD) { bestD = d; best = u; }
      }
    }
    if (best >= 0) {
      taken[v] = 1; taken[best] = 1;
      welds.push({ i: v, j: best, a: owner[v], b: owner[best] });
    }
  }
  return welds;
}
