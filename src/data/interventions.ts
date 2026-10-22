// What the player can do about it. Each one changes a parameter of the model over a time
// course; nothing here is a dose that has been matched to a real drug, and the cards say so.

import type { Intervention } from '../contracts';

export const ANTIVIRAL: Intervention = {
  id: 'antiviral',
  name: 'Antiviral',
  blurb:
    'Blocks replication inside infected cells, so each one releases fewer virions. Modelled as a ' +
    'straight cut to the production rate; the dose is a fraction blocked, not a real drug dose.',
  dose: { min: 0, max: 0.95, default: 0.8, unit: 'fraction of production blocked' },
  effects: [{ target: 'production', op: 'mul', perDose: 1 }],
  onsetMin: 60,
  halfLifeMin: 1440,
  sources: ['ours (grade D)'],
};

export const INTERFERON: Intervention = {
  id: 'ifn',
  name: 'Interferon',
  blurb:
    'Raises the interferon the tissue is making, so uninfected cells become resistant. When it ' +
    'is given matters far more than how much: early it walls the infection off, late it is ' +
    'chasing a fire that has already spread. The whole interferon submodel is ours (grade D).',
  dose: { min: 0, max: 8, default: 4, unit: 'times the tissue’s own secretion' },
  effects: [{ target: 'ifnLevel', op: 'add', perDose: 1 }],
  onsetMin: 30,
  halfLifeMin: 720,
  sources: ['ours (grade D); the shape follows Rand et al. 2012 and the PhysiCell coalition model'],
};

export const INTERVENTIONS: Intervention[] = [ANTIVIRAL, INTERFERON];
export const intervention = (id: string): Intervention => INTERVENTIONS.find((i) => i.id === id)!;
