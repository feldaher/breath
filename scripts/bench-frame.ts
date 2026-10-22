// One whole frame with the disease running: physics, biology and the view, against 16.6 ms.
import { World } from '../src/sim/world';
import { DEFAULT_BREATHING } from '../src/mech/breathing';
import { drawSac, type Camera } from '../src/render/sac';
import { sampleAll } from '../src/game/readouts';

const noop = () => {};
const ctx = {
  canvas: { width: 1600, height: 1000 },
  clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop, stroke: noop,
  fillStyle: '', strokeStyle: '', lineWidth: 1,
} as unknown as CanvasRenderingContext2D;
const cam: Camera = { yaw: 0.5, pitch: 0.25, dist: 460 };

for (const [spacing, speed] of [[20, 60], [14, 60], [14, 240]] as [number, number][]) {
  const w = new World({ spacingUm: spacing, seed: 7, speed });
  w.infect(3);
  for (let f = 0; f < 60; f++) { w.update(1 / 60, DEFAULT_BREATHING); drawSac(ctx, w.breathing, cam, { view: 'cells', epi: w.epi }); }
  let total = 0, draw = 0, read = 0;
  for (let f = 0; f < 120; f++) {
    let t = performance.now(); w.update(1 / 60, DEFAULT_BREATHING); total += performance.now() - t;
    t = performance.now(); drawSac(ctx, w.breathing, cam, { view: 'cells', epi: w.epi }); draw += performance.now() - t;
    t = performance.now(); sampleAll(w.snapshot()); read += performance.now() - t;
  }
  console.log(
    `${spacing}µm, ${speed}× speed: ${w.acinus.membrane.invMass.length} nodes, ${w.epi.n} cells — ` +
    `sim ${(total / 120).toFixed(2)}ms + draw ${(draw / 120).toFixed(2)}ms = ${((total + draw) / 120).toFixed(2)}ms/frame ` +
    `(one readout sweep ${(read / 120).toFixed(2)}ms)`,
  );
}
