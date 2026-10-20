// One whole frame: physics plus the canvas view, against a 16.6 ms budget.
import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';
import { buildAcinus } from '../src/tissue/acinus';
import { makeBreathing, stepBreathing, DEFAULT_BREATHING } from '../src/mech/breathing';
import { drawSac, type Camera } from '../src/render/sac';

const noop = () => {};
const ctx = {
  canvas: { width: 1600, height: 1000 },
  clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop,
  fillStyle: '',
} as unknown as CanvasRenderingContext2D;
const cam: Camera = { yaw: 0.5, pitch: 0.25, dist: 420 };

for (const spacing of [20, 14]) {
  const b = makeBreathing(buildAcinus(ALVEOLAR_SAC, spacing), ALVEOLAR_SAC, 7);
  for (let f = 0; f < 30; f++) { stepBreathing(b, 1 / 60, DEFAULT_BREATHING); drawSac(ctx, b, cam, 1); }
  let phys = 0, draw = 0;
  for (let f = 0; f < 60; f++) {
    let t = performance.now(); stepBreathing(b, 1 / 60, DEFAULT_BREATHING); phys += performance.now() - t;
    t = performance.now(); drawSac(ctx, b, cam, 1); draw += performance.now() - t;
  }
  console.log(`${spacing}µm: ${b.acinus.membrane.invMass.length} nodes, ${b.acinus.membrane.tris.length / 3} tris — physics ${(phys / 60).toFixed(2)}ms + draw ${(draw / 60).toFixed(2)}ms = ${((phys + draw) / 60).toFixed(2)}ms/frame`);
}
