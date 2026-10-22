// What the player can read off the sac. Every one is a pure function of a snapshot, so the same
// state always gives the same number and a run can be replayed.

import { CellState, type Readout, type ReadoutId, type SimSnapshot } from '../contracts';
import { EPI_KINDS } from '../cells/epithelium';

const kindShare = (s: SimSnapshot, kind: string, alive: boolean) => {
  let n = 0, total = 0;
  for (let i = 0; i < s.epi.n; i++) {
    if (EPI_KINDS[s.epi.kind[i]] !== kind) continue;
    total++;
    const dead = s.epi.state[i] === CellState.Dead || s.epi.state[i] === CellState.Denuded;
    if (dead !== alive) n++;
  }
  return total ? n / total : 0;
};

const fieldTotal = (s: SimSnapshot, id: 'virion' | 'ifn') => {
  let t = 0;
  for (let i = 0; i < s.field[id].length; i++) t += s.field[id][i] * s.nodeArea[i];
  return t;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const READOUTS: Readout[] = [
  {
    id: 'viralLoad', label: 'Viral load', unit: 'virions on the sac', grade: 'B',
    sample: (s) => fieldTotal(s, 'virion'),
  },
  {
    id: 'infectedFrac', label: 'Cells infected', unit: 'fraction', grade: 'B',
    sample: (s) => {
      let n = 0;
      for (let i = 0; i < s.epi.n; i++) {
        const st = s.epi.state[i];
        if (st === CellState.Eclipse || st === CellState.Producing || st === CellState.Apoptotic) n++;
      }
      return s.epi.n ? n / s.epi.n : 0;
    },
  },
  { id: 'at1Alive', label: 'AT1 alive', unit: 'fraction', grade: 'B', sample: (s) => kindShare(s, 'AT1', true) },
  { id: 'at2Alive', label: 'AT2 alive', unit: 'fraction', grade: 'B', sample: (s) => kindShare(s, 'AT2', true) },
  { id: 'ifn', label: 'Interferon', unit: 'units on the sac', grade: 'D', sample: (s) => fieldTotal(s, 'ifn') },
  {
    id: 'openAlveoli', label: 'Alveoli open', unit: 'fraction', grade: 'C',
    sample: (s) => (s.alveoli.length ? s.alveoli.filter((a) => a.open).length / s.alveoli.length : 0),
  },
  { id: 'oedema', label: 'Oedema', unit: 'fraction of volume', grade: 'D', sample: (s) => mean(s.alveoli.map((a) => a.oedema)) },
  {
    id: 'compliance', label: 'Tidal volume', unit: 'fraction of resting volume', grade: 'C',
    sample: (s) => mean(s.alveoli.map((a) => a.tidalFrac)),
  },
  {
    // A proxy, NOT a PO2: no haemoglobin, no perfusion, no diffusion limitation. Grade D, and
    // the HUD says so wherever it is shown.
    id: 'gasExchange', label: 'Gas exchange (illustrative)', unit: 'fraction of healthy', grade: 'D',
    sample: (s) => {
      let now = 0, healthy = 0;
      for (const a of s.alveoli) {
        healthy += a.restVolumeUm3;
        if (!a.open) continue;
        now += a.restVolumeUm3 * (1 - a.oedema) * (1 - a.denudedFrac);
      }
      return healthy ? now / healthy : 0;
    },
  },
];

export const readout = (id: ReadoutId): Readout => READOUTS.find((r) => r.id === id)!;

/** Samples every readout. */
export function sampleAll(s: SimSnapshot): Record<ReadoutId, number> {
  const out = {} as Record<ReadoutId, number>;
  for (const r of READOUTS) out[r.id] = r.sample(s);
  return out;
}
