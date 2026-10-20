// Can a clean surface-nets mesh of the air space be partitioned into closed per-alveolus cavities?
import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';
import { planAcinus, airSdf } from '../src/tissue/acinus';
import { buildSkinGeometry } from '@feldaher/cell-engine/mesh/surface';
import { capBoundary, isClosed } from '@feldaher/cell-engine/mesh/boundary';
import { cavityVolume } from '@feldaher/cell-engine/physics/cavity';
import type { Shape, Vec3 } from '@feldaher/cell-engine/contracts';

const plan = planAcinus(ALVEOLAR_SAC);
const air = airSdf(plan);
const R = plan.alveolusRadiusUm;
const reach = R + 2;
const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
for (const c of [...plan.centres, [plan.ductHalfLengthUm, 0, 0] as Vec3, [-plan.ductHalfLengthUm, 0, 0] as Vec3])
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], c[k] - reach); hi[k] = Math.max(hi[k], c[k] + reach); }
const shape: Shape = { sdf: air, uncut: air, planes: [], material: () => 0, bounds: { lo, hi }, mesh: { minSpacing: 0, maxSpacing: 0, minParticles: 0, skinGrid: 0 } };
const sphere = (4 / 3) * Math.PI * R ** 3;

for (const g of [20, 14, 10]) {
  const t0 = Date.now();
  const m = buildSkinGeometry(shape, lo as number[], hi as number[], g);
  const build = Date.now() - t0;
  const nv = m.pos.length / 3, nt = m.idx.length / 3;
  const whole = cavityVolume(m.pos, m.idx);
  // Partition triangles by nearest alveolus centre; triangles nearest the duct axis are the duct.
  const owner: number[] = [];
  for (let t = 0; t < m.idx.length; t += 3) {
    const c: Vec3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) for (let v = 0; v < 3; v++) c[k] += m.pos[3 * m.idx[t + v] + k] / 3;
    let best = -1, bestD = Infinity;
    plan.centres.forEach((q, i) => {
      const d = Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]) - R;
      if (d < bestD) { bestD = d; best = i; }
    });
    owner.push(Math.hypot(c[1], c[2]) - plan.ductRadiusUm < bestD ? -1 : best);
  }
  let closed = 0; const vols: number[] = [];
  for (let i = 0; i < plan.centres.length; i++) {
    const mine: number[] = [];
    for (let f = 0; f < owner.length; f++) if (owner[f] === i) mine.push(m.idx[3 * f], m.idx[3 * f + 1], m.idx[3 * f + 2]);
    const open = Uint32Array.from(mine);
    let capped: Uint32Array;
    try { capped = Uint32Array.from([...open, ...capBoundary(open)]); }
    catch (e) { console.log(`  alveolus ${i}: ${(e as Error).message}`); continue; }
    if (isClosed(capped)) closed++;
    vols.push(cavityVolume(m.pos, capped) / sphere);
  }
  console.log(`grid ${g}µm: ${nv} verts ${nt} tris, build ${build}ms, whole-air closed=${isClosed(m.idx)} vol=${(whole / 1e6).toFixed(1)}e6µm³ | per-alveolus closed ${closed}/8 vol/sphere ${vols.length ? Math.min(...vols).toFixed(2) + '–' + Math.max(...vols).toFixed(2) : '-'}`);
}
