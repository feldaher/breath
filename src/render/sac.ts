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

/** Colour of each alveolus: open ones blue, collapsed ones red, shaded by facing. */
function shade(open: boolean, lambert: number): string {
  const l = 0.25 + 0.75 * Math.max(0, lambert);
  const [r, g, b] = open ? [92, 150, 190] : [190, 96, 80];
  return `rgb(${Math.round(r * l)},${Math.round(g * l)},${Math.round(b * l)})`;
}

export function drawSac(ctx: CanvasRenderingContext2D, b: Breathing, cam: Camera, dpr: number): void {
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

  // Which alveolus each triangle belongs to, and whether it is open.
  const owner = ownerOf(b.acinus);
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

  for (const t of order) {
    const a = tris[t], c = tris[t + 1], d = tris[t + 2];
    // Flat shading from the un-projected normal, lit from over the viewer's shoulder.
    const ux = m.pos[3 * c] - m.pos[3 * a], uy = m.pos[3 * c + 1] - m.pos[3 * a + 1], uz = m.pos[3 * c + 2] - m.pos[3 * a + 2];
    const wx = m.pos[3 * d] - m.pos[3 * a], wy = m.pos[3 * d + 1] - m.pos[3 * a + 1], wz = m.pos[3 * d + 2] - m.pos[3 * a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const lx = cy * 0.4 + sy * 0.8, lz = -sy * 0.4 + cy * 0.8;
    ctx.fillStyle = shade(b.open[owner[t / 3]] === 1, nx * lx + ny * 0.45 + nz * lz);
    ctx.beginPath();
    ctx.moveTo(vx[a], vy[a]);
    ctx.lineTo(vx[c], vy[c]);
    ctx.lineTo(vx[d], vy[d]);
    ctx.closePath();
    ctx.fill();
  }
  void dpr;
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
