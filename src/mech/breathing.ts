// Breathing: each alveolus is pulled toward a volume target that rises and falls (model spec E3),
// and the pressure it takes to do that comes out of the constraint rather than being drawn (E4).
// An alveolus that falls below its closing volume collapses, and needs a real pressure to reopen
// (E5) — the hysteresis is the point, because it is what makes losing surfactant matter.

import { cavityPressure, cavityVolume, solveCavities } from '@feldaher/cell-engine/physics/cavity';
import { step as membraneStep, type MembraneParams } from '@feldaher/cell-engine/physics/membrane';
import type { Acinus } from '../tissue/acinus';
import type { AlveolusState, TissueSpec } from '../contracts';

export interface BreathingParams extends MembraneParams {
  /**
   * Solver pressure to cmH2O (grade D). Calibrated so a healthy sac at `substeps` = 4 swings by
   * about 5 cmH2O over a breath, which is a normal transpulmonary swing.
   *
   * It depends on the substep count. While a cavity is stiff its multiplier is the impulse that
   * corrects the remaining error rather than a static force, and λ/h² then grows as 1/h²
   * (measured: swing 6.2e3, 2.5e4, 9.9e4 solver units at 4, 8 and 16 substeps). Making the
   * cavity compliant enough to fix that costs volume tracking: at a compliance where the two
   * agree within 30 %, the volume misses its target by 3 to 4 %. Volume is what the game is
   * built on, so the stiff cavity stays and the pressure is calibrated per substep count.
   * Reported pressures are therefore comparable within a run, not across solver settings, and
   * the P-V loop (phase 3) needs this settled first.
   */
  pressureScale: number;
}

export const DEFAULT_BREATHING: BreathingParams = {
  substeps: 4,
  softness: 100,
  bendRatio: 50,
  damping: 20,
  pressureScale: 8.1e-4,
};

export interface Breathing {
  acinus: Acinus;
  /** Seconds per displayed breath. Not a physiological rate; see model spec §6. */
  periodS: number;
  /** Where we are in the breath, 0 to 1. */
  phase: number;
  /** Per alveolus. */
  tidal: Float64Array;       // ε_a, the tidal volume fraction at full health
  surfactant: Float64Array;  // σ_a, 1 = healthy (E14)
  oedema: Float64Array;      // φ_a, fraction of the volume filled with fluid (E15)
  open: Uint8Array;
  pressure: Float64Array;    // from the last substep (E4)
  /** Volume at the start and the extremes of the current breath, for the tidal readout. */
  minVolume: Float64Array;
  maxVolume: Float64Array;
  lastTidal: Float64Array;
  closingFrac: number;
  reopenPressure: number;
  closingGain: number;
  reopenGain: number;
  surfactantExponent: number;
  /** How much resting volume is lost when surfactant is gone (E16). */
  restingVolumeLoss: number;
  /** Fraction of its resting volume a collapsed alveolus holds. */
  collapsedFrac: number;
}

/** A small deterministic generator, so a sac is the same sac every time. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function makeBreathing(acinus: Acinus, spec: TissueSpec, seed = 1): Breathing {
  const n = acinus.alveoli.length;
  const m = spec.mechanics, c = spec.coupling;
  const r = rng(seed);
  const tidal = new Float64Array(n);
  // Measured alveolar inflation varies a lot between alveoli (6.7 ± 4.7 %), and showing that
  // spread is part of the point, so each one gets its own.
  for (let i = 0; i < n; i++) tidal[i] = Math.max(0.01, m.tidalVolumeFraction.value * (1 + m.tidalSpread * (2 * r() - 1)));
  return {
    acinus,
    periodS: m.breathPeriodS,
    phase: 0,
    tidal,
    surfactant: new Float64Array(n).fill(1),
    oedema: new Float64Array(n),
    open: new Uint8Array(n).fill(1),
    pressure: new Float64Array(n),
    minVolume: Float64Array.from(acinus.alveoli, (a) => a.restVolumeUm3),
    maxVolume: Float64Array.from(acinus.alveoli, (a) => a.restVolumeUm3),
    lastTidal: Float64Array.from(tidal),
    closingFrac: m.closingVolumeFrac.value,
    reopenPressure: m.reopenPressure.value,
    closingGain: c.closingVolumeGain.value,
    reopenGain: c.reopenPressureGain.value,
    surfactantExponent: c.surfactantExponent.value,
    restingVolumeLoss: c.restingVolumeLoss.value,
    collapsedFrac: 0.3,
  };
}

/** The breath waveform: 0 at the bottom of expiration, 1 at the top of inspiration. */
export function breathWave(phase: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
}

/**
 * Target volume of one alveolus right now (E3, E16), or its collapsed volume.
 *
 * Losing surfactant does two things, and the second is what makes it matter: the tidal
 * excursion shrinks, AND the alveolus holds less at the same pressure, because surface tension
 * has risen. Without that second term an alveolus starved of surfactant would merely stop
 * breathing, and could never reach its closing volume.
 */
export function targetVolume(b: Breathing, i: number, wave: number): number {
  const rest = b.acinus.alveoli[i].restVolumeUm3;
  if (!b.open[i]) return rest * b.collapsedFrac;
  const lost = 1 - b.surfactant[i];
  const eps = b.tidal[i] * Math.pow(b.surfactant[i], b.surfactantExponent);
  return rest * (1 - b.oedema[i]) * (1 - b.restingVolumeLoss * lost) * (1 + eps * wave);
}

/** The volume below which this alveolus closes, and the pressure needed to reopen it (E5). */
export function closingVolume(b: Breathing, i: number): number {
  const lost = 1 - b.surfactant[i];
  return b.acinus.alveoli[i].restVolumeUm3 * b.closingFrac * (1 + b.closingGain * lost);
}
export function reopenPressure(b: Breathing, i: number): number {
  return b.reopenPressure * (1 + b.reopenGain * (1 - b.surfactant[i]));
}

/**
 * Advances the mechanics by `dtS` seconds of real time: moves the breath on, sets each
 * alveolus's target, solves the membrane with its cavities, and applies the collapse rule.
 * `peep` is an extra driving pressure (phase 3); 0 for now.
 */
export function stepBreathing(b: Breathing, dtS: number, p: BreathingParams = DEFAULT_BREATHING, peep = 0): void {
  const before = b.phase;
  b.phase = (b.phase + dtS / b.periodS) % 1;
  const wave = breathWave(b.phase);
  const h = dtS / p.substeps;

  for (let i = 0; i < b.acinus.cavities.length; i++) b.acinus.cavities[i].target = targetVolume(b, i, wave);

  membraneStep(b.acinus.membrane, p, dtS, () => { solveCavities(b.acinus.membrane, b.acinus.cavities, h); });

  const m = b.acinus.membrane;
  for (let i = 0; i < b.acinus.alveoli.length; i++) {
    const v = cavityVolume(m.pos, b.acinus.alveoli[i].tris);
    b.pressure[i] = cavityPressure(b.acinus.cavities[i], h) * p.pressureScale;
    if (b.open[i]) {
      if (v < closingVolume(b, i)) b.open[i] = 0;
    } else if (b.pressure[i] + peep > reopenPressure(b, i)) {
      b.open[i] = 1;
    }
    b.minVolume[i] = Math.min(b.minVolume[i], v);
    b.maxVolume[i] = Math.max(b.maxVolume[i], v);
  }

  // At the bottom of each breath, close the books on the one just finished.
  if (b.phase < before) {
    for (let i = 0; i < b.lastTidal.length; i++) {
      // A collapsed alveolus has no tidal volume. Measuring max − min over the breath it
      // collapsed in would otherwise report the collapse itself as a large excursion.
      b.lastTidal[i] = b.open[i] ? (b.maxVolume[i] - b.minVolume[i]) / b.acinus.alveoli[i].restVolumeUm3 : 0;
      const v = cavityVolume(m.pos, b.acinus.alveoli[i].tris);
      b.minVolume[i] = v; b.maxVolume[i] = v;
    }
  }
}

/** The per-alveolus state the readouts and the disease model see. */
export function alveolusStates(b: Breathing): AlveolusState[] {
  const m = b.acinus.membrane;
  return b.acinus.alveoli.map((a, i) => ({
    restVolumeUm3: a.restVolumeUm3,
    volumeUm3: cavityVolume(m.pos, a.tris),
    pressureCmH2O: b.pressure[i],
    tidalFrac: b.lastTidal[i],
    open: b.open[i] === 1,
    surfactant: b.surfactant[i],
    oedema: b.oedema[i],
    denudedFrac: 0,
  }));
}
