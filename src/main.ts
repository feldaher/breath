import './style.css';
import { ALVEOLAR_SAC } from './data/tissues/alveolar-sac';
import { buildAcinus } from './tissue/acinus';
import { alveolusStates, makeBreathing, stepBreathing, DEFAULT_BREATHING, type Breathing } from './mech/breathing';
import { drawSac, type Camera } from './render/sac';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const stats = document.getElementById('stats')!;
const cam: Camera = { yaw: 0.5, pitch: 0.25, dist: 420 };

let breathing: Breathing;
let paused = false;
let peep = 0;

function build() {
  // 14 µm edges: 5,136 nodes, measured at 3.9 ms of physics and 1.4 ms of drawing a frame
  // (scripts/bench-frame.ts), which leaves most of the budget for the biology to come.
  breathing = makeBreathing(buildAcinus(ALVEOLAR_SAC, 14), ALVEOLAR_SAC, 7);
}
build();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', (e) => { dragging = false; canvas.releasePointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.yaw += (e.clientX - lastX) * 0.01;
  cam.pitch = Math.max(-1.3, Math.min(1.3, cam.pitch + (e.clientY - lastY) * 0.01));
  lastX = e.clientX; lastY = e.clientY;
});

const button = (id: string, f: () => void) => document.getElementById(id)!.addEventListener('click', f);
button('pause', () => {
  paused = !paused;
  document.getElementById('pause')!.textContent = paused ? 'Play' : 'Pause';
});
button('surf', () => { breathing.surfactant[0] = 0; });
button('peep', () => {
  peep = peep > 0 ? 0 : 2 * breathing.reopenPressure;
  document.getElementById('peep')!.setAttribute('aria-pressed', String(peep > 0));
});
button('reset', () => { build(); peep = 0; document.getElementById('peep')!.setAttribute('aria-pressed', 'false'); });

function showStats() {
  const s = alveolusStates(breathing);
  const open = s.filter((a) => a.open).length;
  const tidal = s.reduce((t, a) => t + a.tidalFrac, 0) / s.length;
  const rows = s
    .map((a, i) => {
      const w = Math.round(60 * (a.volumeUm3 / a.restVolumeUm3));
      return `<tr><td>${i + 1}</td><td><span class="bar${a.open ? '' : ' shut'}" style="width:${w}px"></span></td>` +
        `<td>${(a.volumeUm3 / 1e6).toFixed(2)}e6 µm³</td><td>${a.open ? (100 * a.tidalFrac).toFixed(1) + '%' : 'shut'}</td></tr>`;
    })
    .join('');
  stats.innerHTML =
    `<table><tr><td>alveoli open</td><td colspan="3">${open} of ${s.length}</td></tr>` +
    `<tr><td>mean tidal</td><td colspan="3">${(100 * tidal).toFixed(1)} % of resting volume</td></tr>` +
    `<tr><td>peak pressure</td><td colspan="3">${Math.max(...s.map((a) => a.pressureCmH2O)).toFixed(1)} cmH₂O${peep > 0 ? ` (+${peep.toFixed(0)} applied)` : ''}</td></tr>` +
    `</table><table style="margin-top:.5rem">${rows}</table>`;
}

let last = performance.now();
let sinceStats = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) stepBreathing(breathing, dt, DEFAULT_BREATHING, peep);
  drawSac(ctx, breathing, cam, 1);
  sinceStats += dt;
  if (sinceStats > 0.2) { showStats(); sinceStats = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
