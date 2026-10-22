// Small line plots of the readouts as a run goes on.

export interface Trace {
  label: string;
  colour: string;
  /** 0 to 1 after scaling; the plot does not rescale itself, so lines stay comparable. */
  points: number[];
}

export function drawPlot(ctx: CanvasRenderingContext2D, traces: Trace[], tMax: number, dayMarks: number): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#2a2d34';
  ctx.lineWidth = 1;
  for (let d = 1; d <= dayMarks; d++) {
    const x = (d / dayMarks) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  ctx.strokeStyle = '#3a3d44';
  ctx.beginPath(); ctx.moveTo(0, h - 1); ctx.lineTo(w, h - 1); ctx.stroke();

  for (const t of traces) {
    if (t.points.length < 2) continue;
    ctx.strokeStyle = t.colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    t.points.forEach((v, i) => {
      const x = (i / Math.max(1, tMax - 1)) * w;
      const y = h - 2 - Math.max(0, Math.min(1, v)) * (h - 4);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
