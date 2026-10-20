// Shared shapes for every layer of Breath. This file is the contract: the tissue, the fields,
// the cells, the interventions, the readouts and the challenges agree on these types and nothing
// else. The soft body itself is the engine's (@feldaher/cell-engine).
//
// Units: µm, minutes, µm³, virions; concentrations are per µm² of alveolar surface, because the
// fields live on the air-side surface (model spec §3). Pressure is cmH2O where it is shown.
// Model: ../../outputs/theory/2026-10-20_model-spec.md, equations E1-E16.

export type { Piece, Plane, SimMesh, SkinMesh, Vec3 } from '@feldaher/cell-engine/contracts';

// ─── Provenance ──────────────────────────────────────────────────────────────

/**
 * How far a number was checked, as in the Jelly Cells source dossiers:
 * A read at the source, B our arithmetic on published values, S a search summary only,
 * C textbook or remembered, D our own modelling choice.
 */
export type Grade = 'A' | 'B' | 'S' | 'C' | 'D';

/** A value the player can be shown, with where it came from. Nothing enters the model untagged. */
export interface Graded {
  value: number;
  unit: string;
  grade: Grade;
  /** Citation or "ours"; shown on the card. */
  source: string;
  /** Whether someone has read the source and confirmed the number this session. */
  verified: boolean;
  note?: string;
}

// ─── Cells ───────────────────────────────────────────────────────────────────

/** Epithelial kinds. Alveolar: AT1, AT2. Airway (phase 4): ciliated, goblet, club, basal. */
export type EpiKind = 'AT1' | 'AT2' | 'ciliated' | 'goblet' | 'club' | 'basal';

export type ImmuneKind = 'AM' | 'neutrophil' | 'CD8';

/**
 * The infection chain (E11) plus two states orthogonal to it that are stored in the same array:
 * Protected is carried as `prot` instead, so only death states appear here.
 * Denuded is a dead AT1 whose basement membrane is now bare, which is what leaks (E15).
 */
export const CellState = {
  Healthy: 0,
  Eclipse: 1,
  Producing: 2,
  Apoptotic: 3,
  Dead: 4,
  Denuded: 5,
} as const;
export type CellStateId = (typeof CellState)[keyof typeof CellState];

/** The epithelium as typed arrays, one entry per cell (structure of arrays). */
export interface Epithelium {
  n: number;
  kind: Uint8Array;
  /** CellStateId. */
  state: Uint8Array;
  /** Minutes left in the current state. */
  timer: Float32Array;
  /** Interferon protection, 0-1 (E13). */
  prot: Float32Array;
  /** Patch area, µm². */
  areaUm2: Float32Array;
  /** Which alveolus the cell belongs to. */
  alveolus: Uint16Array;
  /** Cell centre in rest space, xyz. */
  centre: Float32Array;
  /** Which cell owns each surface vertex; length = number of surface vertices. */
  vertexCell: Uint32Array;
}

/** Immune agents riding on the alveolar surface. */
export interface ImmuneAgents {
  n: number;
  kind: Uint8Array;
  /** Triangle the agent sits on, with barycentric weights (3 per agent). */
  tri: Uint32Array;
  bary: Float32Array;
  /** Internalised debris or virions; an exhausted macrophage stops taking up (coalition rule 5.MPhi.10). */
  load: Float32Array;
  /** 0 resident, 1 activated, 2 exhausted. */
  state: Uint8Array;
}

// ─── Pathogen, fields, tissue ────────────────────────────────────────────────

export type FieldId = 'virion' | 'ifn' | 'cytokine';

export interface FieldSpec {
  id: FieldId;
  /** Diffusion coefficient on the surface. */
  D: Graded;
  /** First-order decay. */
  decay: Graded;
  /**
   * Which time integrator to use. 'implicit' (backward Euler) is the default and is always safe;
   * 'explicit' is an optimisation that is only allowed when the stability bound E9 passes with
   * margin, and the solver throws if it does not.
   */
  scheme: 'implicit' | 'explicit';
}

export interface PathogenSpec {
  id: string;
  name: string;
  kind: 'virus';
  /** Relative susceptibility by cell kind (SARS-CoV-2: AT2 >> AT1, via ACE2/TMPRSS2). */
  tropism: Partial<Record<EpiKind, number>>;
  /** Rate constant of E12, per virion per minute. */
  infectivity: Graded;
  eclipseMin: Graded;
  producingMin: Graded;
  apoptosisMin: Graded;
  /** Virions released per minute by a producing cell. */
  productionPerMin: Graded;
  /** How much the pathogen suppresses interferon secretion, 0-1. */
  ifnAntagonism: Graded;
  /** How strongly interferon protection blocks this pathogen, 0-1. */
  ifnSensitivity: Graded;
  sources: string[];
}

/** An acinus of alveoli (phase 1) or a length of bronchiole (phase 4). */
export type Geometry =
  | { kind: 'acinus'; nAlveoli: number; alveolusRadiusUm: Graded; ductRadiusUm: Graded; wallUm: Graded; seed: number }
  | { kind: 'airway'; radiusUm: Graded; lengthUm: Graded; pclUm: Graded; mucusVelocityUmPerS: Graded };

export interface TissueSpec {
  id: 'alveolar-sac' | 'bronchiole';
  name: string;
  geometry: Geometry;
  /** How many cells of each kind an alveolus carries, and how big each is. */
  epithelium: { kind: EpiKind; perAlveolus: Graded; areaUm2: Graded }[];
  resident: { kind: ImmuneKind; perAlveolus: Graded }[];
  mechanics: {
    /** Seconds per displayed breath; not a physiological rate (spec §6). */
    breathPeriodS: number;
    /** Baseline tidal volume fraction of an alveolus, and the spread between alveoli (E3). */
    tidalVolumeFraction: Graded;
    tidalSpread: number;
    /** Below this fraction of its resting volume an alveolus collapses (E5). */
    closingVolumeFrac: Graded;
    /** Driving pressure needed to reopen a collapsed alveolus, cmH2O (E5). */
    reopenPressure: Graded;
  };
  /** Coupling constants of E14-E16; all grade D. */
  coupling: {
    surfactantTauMin: Graded;
    surfactantExponent: Graded;
    /** How much of its resting volume an alveolus gives up when surfactant is wholly lost (E16). */
    restingVolumeLoss: Graded;
    leakPerMin: Graded;
    clearPerMin: Graded;
    closingVolumeGain: Graded;
    reopenPressureGain: Graded;
  };
  fields: FieldSpec[];
}

// ─── Interventions ───────────────────────────────────────────────────────────

/** What an intervention can change. Each maps to one place in the model. */
export type ModTarget =
  | 'production'        // antiviral: virions made per producing cell
  | 'infectivity'       // neutralising antibody: the rate constant of E12
  | 'virionClearance'
  | 'ifnLevel'          // exogenous interferon
  | 'neutrophilRecruit' // steroid (phase 2)
  | 'neutrophilDamage'
  | 'tcellArrivalMin'   // vaccine memory (phase 2)
  | 'peep';             // phase 3

export interface Intervention {
  id: string;
  name: string;
  /** One sentence on the card, including what is modelled and what is not. */
  blurb: string;
  dose: { min: number; max: number; default: number; unit: string };
  /** Applied as parameter × (1 − efficacy·a(t)) for 'mul', or + for 'add'. */
  effects: { target: ModTarget; op: 'mul' | 'add'; perDose: number }[];
  /** Time constant of onset, minutes. */
  onsetMin: number;
  /** Elimination half-life, minutes; omitted for something that does not wash out. */
  halfLifeMin?: number;
  sources: string[];
}

/** One dose given at one moment; a run is a list of these plus a seed. */
export interface Action {
  tMin: number;
  id: Intervention['id'];
  dose: number;
}

// ─── Readouts and runs ───────────────────────────────────────────────────────

export type ReadoutId =
  | 'viralLoad'
  | 'infectedFrac'
  | 'at1Alive'
  | 'at2Alive'
  | 'ifn'
  | 'openAlveoli'
  | 'oedema'
  | 'compliance'
  | 'gasExchange';

export interface Readout {
  id: ReadoutId;
  label: string;
  unit: string;
  /** Grade of the quantity itself: gasExchange is a D proxy and says so. */
  grade: Grade;
  sample(s: SimSnapshot): number;
}

/** What a readout is allowed to see: a flat, read-only view of the simulation. */
export interface SimSnapshot {
  tMin: number;
  epi: Epithelium;
  immune: ImmuneAgents;
  /** Nodal concentrations per field. */
  field: Record<FieldId, Float64Array>;
  /** Lumped nodal area (µm²), for integrating a field over the surface. */
  nodeArea: Float64Array;
  alveoli: AlveolusState[];
}

/** Per-alveolus mechanical and damage state (E14-E16). */
export interface AlveolusState {
  /** Resting volume as built, µm³. */
  restVolumeUm3: number;
  /** Current enclosed volume (E1). */
  volumeUm3: number;
  /** Pressure from the constraint multiplier, cmH2O (E4). */
  pressureCmH2O: number;
  /** Realised tidal volume fraction over the last breath. */
  tidalFrac: number;
  open: boolean;
  /** Surfactant level 0-1 (E14). */
  surfactant: number;
  /** Fraction of the volume filled with fluid (E15). */
  oedema: number;
  /** Fraction of AT1 area that is bare basement membrane. */
  denudedFrac: number;
}

export interface Series {
  tMin: number[];
  v: number[];
}

/** A run as recorded: enough to replay it exactly. */
export interface RunRecord {
  challengeId: string;
  seed: number;
  pathogen: PathogenSpec['id'];
  tissue: TissueSpec['id'];
  actions: Action[];
  series: Partial<Record<ReadoutId, Series>>;
  /** Simulated minutes the run reached. */
  durationMin: number;
}

// ─── Challenges ──────────────────────────────────────────────────────────────

export type Goal = {
  readout: ReadoutId;
  op: 'peakBelow' | 'finalAbove' | 'finalBelow' | 'aucBelow' | 'atTimeAbove';
  value: number;
  /** Required by 'atTimeAbove'; ignored otherwise. */
  atMin?: number;
};

export interface Challenge {
  id: string;
  title: string;
  /** What the player is asked to do, in one or two sentences. */
  prompt: string;
  tissue: TissueSpec['id'];
  pathogen: PathogenSpec['id'];
  allowed: Intervention['id'][];
  /** Maximum total dose across all interventions; omitted for unlimited. */
  budget?: number;
  durationMin: number;
  goals: Goal[];
  /** How many goals must pass for 1, 2 and 3 stars. */
  stars: [number, number, number];
  hint: string;
  /** What the challenge is teaching, and which part of it is modelled rather than measured. */
  source: string;
}

export interface Verdict {
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  perGoal: { goal: Goal; achieved: number; passed: boolean }[];
  reasons: string[];
}

/** Pure: the same run and challenge always give the same verdict. */
export type Judge = (run: RunRecord, ch: Challenge) => Verdict;
