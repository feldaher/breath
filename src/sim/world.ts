// The two clocks (model spec §6) and the coupling between them.
//
// Mechanics run in real time, a displayed breath every few seconds. Disease runs in fixed
// one-minute steps at whatever speed the player picks. They meet once a breath: the disease
// hands over each alveolus's surfactant and oedema, and gets back how it actually breathed.
//
// The number of breaths in a simulated day is therefore NOT physiological, so nothing that
// accumulates may be driven by counting displayed breaths. Everything below runs on dtMin.

import { membraneArea } from '@feldaher/cell-engine/physics/membrane';
import { ALVEOLAR_SAC } from '../data/tissues/alveolar-sac';
import { SARS_COV_2 } from '../data/pathogens/sars-cov-2';
import { buildAcinus, type Acinus } from '../tissue/acinus';
import { alveolusStates, makeBreathing, stepBreathing, DEFAULT_BREATHING, type Breathing, type BreathingParams } from '../mech/breathing';
import { placeEpithelium } from '../cells/epithelium';
import { aliveFraction, defaultLifecycle, denudedFraction, seedInfection, stepCells, type LifecycleParams } from '../cells/lifecycle';
import { DEFAULT_IFN, secreteIfn, updateProtection, type IfnParams } from '../cells/ifn';
import { DEFAULT_MACROPHAGE, placeMacrophages, stepMacrophages, type MacrophageParams } from '../immune/macrophage';
import { makeFields, refitFields, stepField, type Fields } from '../fields/surface';
import type { Epithelium, ImmuneAgents, PathogenSpec, SimSnapshot, TissueSpec } from '../contracts';

/** Simulated minutes per step of the disease clock (SIMCoV's step). */
export const DT_BIO = 1;

/** Disease steps per frame, so one frame's work stays bounded however fast the clock is set. */
export const MAX_BIO_STEPS_PER_FRAME = 4;

export interface WorldOptions {
  tissue?: TissueSpec;
  pathogen?: PathogenSpec;
  spacingUm?: number;
  seed?: number;
  /** Simulated minutes per second of real time. 0 pauses the disease. */
  speed?: number;
}

export class World {
  readonly tissue: TissueSpec;
  readonly pathogen: PathogenSpec;
  readonly acinus: Acinus;
  readonly breathing: Breathing;
  readonly epi: Epithelium;
  readonly immune: ImmuneAgents;
  readonly fields: Fields;
  readonly lifecycle: LifecycleParams;
  readonly ifn: IfnParams;
  readonly macrophage: MacrophageParams;

  /** Simulated minutes since the start. */
  tMin = 0;
  speed: number;
  peep = 0;
  /** True when the disease clock cannot keep up with `speed` and is running slower than asked. */
  behind = false;
  private bioDebt = 0;
  private lastBreath = 0;
  private readonly rand: () => number;
  private readonly release: Float64Array;
  private readonly ifnRelease: Float64Array;
  private readonly uptake: Float64Array;

  constructor(o: WorldOptions = {}) {
    this.tissue = o.tissue ?? ALVEOLAR_SAC;
    this.pathogen = o.pathogen ?? SARS_COV_2;
    this.speed = o.speed ?? 30;
    const seed = o.seed ?? 7;
    this.rand = rng(seed);
    this.acinus = buildAcinus(this.tissue, o.spacingUm ?? 14);
    this.breathing = makeBreathing(this.acinus, this.tissue, seed);
    this.epi = placeEpithelium(this.acinus, this.tissue, seed + 1);
    this.immune = placeMacrophages(this.acinus, this.tissue, this.rand);
    this.fields = makeFields(this.acinus, this.tissue);
    this.lifecycle = defaultLifecycle(this.pathogen);
    this.ifn = { ...DEFAULT_IFN };
    this.macrophage = { ...DEFAULT_MACROPHAGE };
    const n = this.acinus.membrane.invMass.length;
    this.release = new Float64Array(n);
    this.ifnRelease = new Float64Array(n);
    this.uptake = new Float64Array(n);
  }

  /** Starts an infection in the alveolus nearest `at` (the first one by default). */
  infect(count = 1, at?: [number, number, number]): number[] {
    return seedInfection(this.epi, at ?? this.acinus.alveoli[0].centre, count, this.pathogen, this.rand);
  }

  /** Advances real time: the mechanics always, the disease as fast as `speed` says. */
  update(dtRealS: number, p: BreathingParams = DEFAULT_BREATHING): void {
    stepBreathing(this.breathing, dtRealS, p, this.peep);
    // Once a breath, hand the mechanics what the disease has done to the tissue.
    if (this.breathing.phase < this.lastBreath) this.exchange();
    this.lastBreath = this.breathing.phase;

    // A disease step costs about 4.6 ms at 5,136 nodes, nearly all of it the two field solves
    // (scripts/bench-frame.ts), so the number of them per frame is capped rather than letting
    // the frame rate fall. Above that the disease clock simply runs slower than asked, which
    // `behind` reports, instead of the whole thing juddering.
    this.bioDebt += dtRealS * this.speed;
    let steps = 0;
    while (this.bioDebt >= DT_BIO && steps < MAX_BIO_STEPS_PER_FRAME) { this.bioDebt -= DT_BIO; this.stepBio(DT_BIO); steps++; }
    this.behind = this.bioDebt > 2 * DT_BIO;
    if (this.bioDebt > 10 * DT_BIO) this.bioDebt = 10 * DT_BIO;   // never chase an unbounded backlog
  }

  /** One minute of disease: cells, fields, interferon, macrophages, damage. */
  stepBio(dtMin: number): void {
    const f = this.fields;
    stepCells(this.epi, f.c.virion, dtMin, this.lifecycle, this.rand, this.release);
    secreteIfn(this.epi, this.pathogen, this.ifn, dtMin, this.ifnRelease);
    stepMacrophages(this.immune, this.acinus, f.c.virion, f.area, dtMin, this.macrophage, this.rand, this.uptake);

    // Sources are amounts per minute over each node's own area.
    const src = new Float64Array(f.solver.nNodes);
    for (let i = 0; i < src.length; i++) src[i] = (this.release[i] - this.uptake[i]) / dtMin;
    stepField(f, 'virion', dtMin, src);
    for (let i = 0; i < src.length; i++) src[i] = this.ifnRelease[i] / dtMin;
    stepField(f, 'ifn', dtMin, src);
    for (const c of Object.values(f.c)) for (let i = 0; i < c.length; i++) if (c[i] < 0) c[i] = 0;

    updateProtection(this.epi, f.c.ifn, this.ifn, dtMin);
    this.damage(dtMin);
    this.tMin += dtMin;
  }

  /** Surfactant from living AT2 (E14) and oedema from bare AT1 (E15). */
  private damage(dtMin: number): void {
    const c = this.tissue.coupling, b = this.breathing;
    const relax = 1 - Math.exp(-dtMin / c.surfactantTauMin.value);
    for (let a = 0; a < this.acinus.alveoli.length; a++) {
      b.surfactant[a] += (aliveFraction(this.epi, a, 'AT2') - b.surfactant[a]) * relax;
      const bare = denudedFraction(this.epi, a);
      const d = c.leakPerMin.value * bare * (1 - b.oedema[a]) - c.clearPerMin.value * b.oedema[a];
      b.oedema[a] = Math.min(0.95, Math.max(0, b.oedema[a] + d * dtMin));
    }
  }

  /** Once a breath: the fields are re-fitted to the shape the sac has settled into. */
  private exchange(): void {
    refitFields(this.fields, this.acinus);
  }

  snapshot(): SimSnapshot {
    return {
      tMin: this.tMin,
      epi: this.epi,
      immune: this.immune,
      field: this.fields.c,
      nodeArea: this.fields.area,
      alveoli: alveolusStates(this.breathing).map((s, i) => ({ ...s, denudedFrac: denudedFraction(this.epi, i) })),
    };
  }

  /** Area of the sac as it is now, µm². */
  get areaUm2(): number {
    return membraneArea(this.acinus.membrane);
  }
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
