// What the membrane acinus costs, and whether it hangs together.
import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';
import { buildAcinus, planAcinus } from '../src/tissue/acinus';
import { isClosed } from '@feldaher/cell-engine/mesh/boundary';
import { cavityVolume, solveCavities } from '@feldaher/cell-engine/physics/cavity';
import { membraneArea, step, type MembraneParams } from '@feldaher/cell-engine/physics/membrane';

const DT = 1 / 60;
const P: MembraneParams = { substeps: 8, softness: 100, bendRatio: 50, damping: 20 };
const ideal = (4 / 3) * Math.PI * 100 ** 3;

console.log('spacing  depth  nodes   tris   welds  build  step(8sub)  closed  vol/ideal      pairs linked');
for (const h of [20, 14, 12, 9]) {
  const t0 = Date.now();
  const ac = buildAcinus(ALVEOLAR_SAC, h);
  const build = Date.now() - t0;
  const n = ac.membrane.invMass.length;
  const t1 = Date.now();
  const hs = DT / P.substeps;
  for (let f = 0; f < 10; f++) step(ac.membrane, P, DT, () => { solveCavities(ac.membrane, ac.cavities, hs); });
  const ms = (Date.now() - t1) / 10;
  const closed = ac.alveoli.filter((a) => isClosed(a.tris)).length;
  const vols = ac.alveoli.map((a) => a.restVolumeUm3 / ideal);
  const linked = new Set(ac.welds.map((w) => (w.a < w.b ? `${w.a}-${w.b}` : `${w.b}-${w.a}`))).size;
  // Is the sac one body? Union-find over the weld graph.
  const parent = ac.alveoli.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const w of ac.welds) parent[find(w.a)] = find(w.b);
  const components = new Set(ac.alveoli.map((_, i) => find(i))).size;
  console.log(
    `${String(h).padStart(6)}µm  ${ac.plan.depth}  ${String(n).padStart(6)} ${String(ac.membrane.tris.length / 3).padStart(6)}  ${String(ac.welds.length).padStart(5)}  ${String(build).padStart(4)}ms  ${ms.toFixed(1).padStart(7)}ms  ${closed}/${ac.alveoli.length}  ` +
    `${Math.min(...vols).toFixed(3)}–${Math.max(...vols).toFixed(3)}  ${linked} pairs, ${components} piece${components === 1 ? '' : 's'}`,
  );
}
const ac = buildAcinus(ALVEOLAR_SAC, 12);
console.log(`cluster radius ${ac.plan.clusterRadiusUm.toFixed(0)}µm, bubble radius ${ac.plan.radiusUm}µm, sac area ${(membraneArea(ac.membrane) / 1e6).toFixed(2)} mm²`);
