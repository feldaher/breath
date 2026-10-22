// A plain canvas view of the sac while the real renderer is being written: triangles projected,
// sorted back to front and filled flat. Enough to watch it breathe and to see an alveolus
// collapse; the jelly look (WebGPU, as in Jelly Cells) comes later.

import type { Acinus } from '../tissue/acinus';
import type { Breathing } from '../mech/breathing';

export interface Camera {
  yaw: number;
  pitch: number;
  dist: number;
}

import { CellState, type Epithelium } from '../contracts';

/** How the sac is coloured: by which alveoli are open, or by what the cells are doing. */
export type View = 'alveoli' | 'cells' | 'virions';

const STATE_RGB: Record<number, [number, number, number]> = {
  [CellState.Healthy]: [92, 150, 190],
  [CellState.Eclipse]: [190, 170, 90],
  [CellState.Producing]: [205, 110, 60],
  [CellState.Apoptotic]: [170, 70, 70],
  [CellState.Dead]: [85, 80, 78],
  [CellState.Denuded]: [60, 56, 54],
};

function rgb([r, g, b]: [number, number, number], l: number): string {
  const k = 0.25 + 0.75 * Math.max(0, l);
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

export interface SacView {
  view: View;
  epi?: Epithelium;
  /** Nodal virion concentration, for the virion view. */
  virion?: Float64Array;
  /** Concentration drawn as fully saturated. */
  virionFull?: number;
}

export function drawSac(ctx: CanvasRenderingContext2D, b: Breathing, cam: Camera, opt: SacView): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const m = b.acinus.membrane;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const scale = (Math.min(width, height) * 0.38) / cam.dist;
  const ox = width / 2, oy = height / 2;

  // Camera space, once per node.
  const n = m.invMass.length;
  const vx = new Float32Array(n), vy = new Float32Array(n), vz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = m.pos[3 * i], y = m.pos[3 * i + 1], z = m.pos[3 * i + 2];
    const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
    const y1 = cp * y - sp * z1, z2 = sp * y + cp * z1;
    vx[i] = ox + x1 * scale; vy[i] = oy - y1 * scale; vz[i] = z2;
  }

  // Back-face cull in screen space, then sort what is left back to front.
  const tris = m.tris;
  const visible: number[] = [];
  const depth = new Float32Array(tris.length / 3);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], c = tris[t + 1], d = tris[t + 2];
    if ((vx[c] - vx[a]) * (vy[d] - vy[a]) - (vy[c] - vy[a]) * (vx[d] - vx[a]) <= 0) continue;
    visible.push(t);
    depth[t / 3] = vz[a] + vz[c] + vz[d];
  }
  const order = visible.sort((p, q) => depth[p / 3] - depth[q / 3]);
  const owner = ownerOf(b.acinus);
  const full = opt.virionFull ?? 0.02;

  for (const t of order) {
    const a = tris[t], c = tris[t + 1], d = tris[t + 2];
    const ux = m.pos[3 * c] - m.pos[3 * a], uy = m.pos[3 * c + 1] - m.pos[3 * a + 1], uz = m.pos[3 * c + 2] - m.pos[3 * a + 2];
    const wx = m.pos[3 * d] - m.pos[3 * a], wy = m.pos[3 * d + 1] - m.pos[3 * a + 1], wz = m.pos[3 * d + 2] - m.pos[3 * a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const lx = cy * 0.4 + sy * 0.8, lz = -sy * 0.4 + cy * 0.8;
    const lambert = nx * lx + ny * 0.45 + nz * lz;

    let colour: string;
    if (opt.view === 'cells' && opt.epi) {
      colour = rgb(STATE_RGB[opt.epi.state[opt.epi.nodeCell[a]]] ?? STATE_RGB[CellState.Healthy], lambert);
    } else if (opt.view === 'virions' && opt.virion) {
      const v = Math.min(1, Math.max(0, (opt.virion[a] + opt.virion[c] + opt.virion[d]) / 3) / full);
      colour = rgb([60 + 170 * v, 70 + 40 * (1 - v), 90 - 40 * v], lambert);
    } else {
      colour = rgb(b.open[owner[t / 3]] === 1 ? [92, 150, 190] : [190, 96, 80], lambert);
    }
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(vx[a], vy[a]);
    ctx.lineTo(vx[c], vy[c]);
    ctx.lineTo(vx[d], vy[d]);
    ctx.closePath();
    ctx.fill();
  }
}

const owners = new WeakMap<Acinus, Uint16Array>();
/** Which alveolus owns each triangle of the merged mesh. */
export function ownerOf(a: Acinus): Uint16Array {
  let o = owners.get(a);
  if (!o) {
    o = new Uint16Array(a.membrane.tris.length / 3);
    let t = 0;
    a.alveoli.forEach((al, i) => {
      const count = al.tris.length / 3;
      o!.fill(i, t, t + count);
      t += count;
    });
    owners.set(a, o);
  }
  return o;
}
