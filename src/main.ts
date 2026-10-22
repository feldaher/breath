import './style.css';
import { World } from './sim/world';
import { DEFAULT_BREATHING } from './mech/breathing';
import { drawSac, type Camera, type View } from './render/sac';
import { drawPlot, type Trace } from './ui/plot';
import { sampleAll } from './game/readouts';
import { applyInterventions } from './sim/interventions';
import { ANTIVIRAL, INTERFERON } from './data/interventions';
import type { Action } from './contracts';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const plot = (document.getElementById('plot') as HTMLCanvasElement).getContext('2d')!;
const stats = document.getElementById('stats')!;
const legend = document.getElementById('legend')!;
const about = document.getElementById('about')!;
const cam: Camera = { yaw: 0.5, pitch: 0.25, dist: 460 };

const DAYS = 7;
const SAMPLES = 300;                       // one point per plot pixel
const MIN_PER_SAMPLE = (DAYS * 1440) / SAMPLES;

let world: World;
let actions: Action[];
let traces: Trace[];
let view: View = 'alveoli';
let paused = false;
let sinceSample = 0;

const TRACES: { id: 'viralLoad' | 'at1Alive' | 'gasExchange'; label: string; colour: string; scale: (v: number) => number }[] = [
  { id: 'viralLoad', label: 'viral load', colour: '#cd6e3c', scale: (v) => Math.log10(1 + v) / 5 },
  { id: 'at1Alive', label: 'AT1 alive', colour: '#5c96be', scale: (v) => v },
  { id: 'gasExchange', label: 'gas exchange', colour: '#7fae7a', scale: (v) => v },
];

function build() {
  // 14 µm edges: measured at about 5 ms a frame for physics and drawing together.
  world = new World({ spacingUm: 14, seed: 7, speed: 60 });
  actions = [];
  traces = TRACES.map((t) => ({ label: t.label, colour: t.colour, points: [] }));
  sinceSample = 0;
  legend.innerHTML = TRACES.map((t) => `<span style="color:${t.colour}">${t.label}</span>`).join('');
  about.textContent =
    'Drag to turn. Every value carries how well it is known: the alveolus, its cells and the ' +
    'infection’s timings are measured; the laws tying damage to collapse, the interferon ' +
    'response and the gas-exchange proxy are ours, and illustrative.';
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

const on = (id: string, f: (el: HTMLElement) => void) => {
  const el = document.getElementById(id)!;
  el.addEventListener('click', () => f(el));
};
document.querySelectorAll<HTMLButtonElement>('#views button').forEach((b) => {
  b.addEventListener('click', () => {
    view = b.dataset.view as View;
    document.querySelectorAll('#views button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  });
});
on('infect', () => world.infect(3));
on('antiviral', () => actions.push({ tMin: world.tMin, id: ANTIVIRAL.id, dose: ANTIVIRAL.dose.default }));
on('ifn', () => actions.push({ tMin: world.tMin, id: INTERFERON.id, dose: INTERFERON.dose.default }));
on('pause', (el) => { paused = !paused; el.textContent = paused ? 'Play' : 'Pause'; });
on('slow', (el) => {
  world.speed = world.speed === 60 ? 1 : world.speed === 1 ? 240 : 60;
  el.textContent = `${world.speed === 1 ? 1 : world.speed}× speed`;
});
on('reset', () => { build(); (document.getElementById('pause') as HTMLElement).textContent = 'Pause'; paused = false; });

function showStats() {
  const s = sampleAll(world.snapshot());
  const day = Math.floor(world.tMin / 1440);
  const hour = Math.floor((world.tMin % 1440) / 60);
  const given = actions.map((a) => `${a.id} at day ${Math.floor(a.tMin / 1440)}, ${String(Math.floor((a.tMin % 1440) / 60)).padStart(2, '0')}:00`);
  stats.innerHTML =
    `<table>` +
    `<tr><td>time</td><td>day ${day}, ${String(hour).padStart(2, '0')}:00${world.behind ? ' <span style="opacity:.6">(catching up)</span>' : ''}</td></tr>` +
    `<tr><td>infected</td><td>${(100 * s.infectedFrac).toFixed(1)} % of cells</td></tr>` +
    `<tr><td>AT1 alive</td><td>${(100 * s.at1Alive).toFixed(1)} %</td></tr>` +
    `<tr><td>AT2 alive</td><td>${(100 * s.at2Alive).toFixed(1)} %</td></tr>` +
    `<tr><td>viral load</td><td>${s.viralLoad < 1 ? s.viralLoad.toFixed(2) : s.viralLoad.toExponential(1)} virions</td></tr>` +
    `<tr><td>alveoli open</td><td>${Math.round(s.openAlveoli * world.acinus.alveoli.length)} of ${world.acinus.alveoli.length}</td></tr>` +
    `<tr><td>gas exchange</td><td>${(100 * s.gasExchange).toFixed(0)} % <span style="opacity:.6">(illustrative)</span></td></tr>` +
    (given.length ? `<tr><td>given</td><td>${given.join('<br>')}</td></tr>` : '') +
    `</table>`;
}

let last = performance.now();
let sinceStats = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    applyInterventions(world, actions);
    world.update(dt, DEFAULT_BREATHING);
    sinceSample += dt * world.speed;
    while (sinceSample >= MIN_PER_SAMPLE && traces[0].points.length < SAMPLES) {
      sinceSample -= MIN_PER_SAMPLE;
      const s = sampleAll(world.snapshot());
      TRACES.forEach((t, i) => traces[i].points.push(t.scale(s[t.id])));
    }
  }
  drawSac(ctx, world.breathing, cam, { view, epi: world.epi, virion: world.fields.c.virion });
  drawPlot(plot, traces, SAMPLES, DAYS);
  sinceStats += dt;
  if (sinceStats > 0.25) { showStats(); sinceStats = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
