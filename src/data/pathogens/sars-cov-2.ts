// SARS-CoV-2 as the model sees it. Timings are SIMCoV's, read at the source; the rest is ours.

import type { Graded, PathogenSpec } from '../../contracts';

const SIMCOV = 'Moses et al. 2021, PLoS Comput Biol 17:e1009735, Table 2';
const g = (value: number, unit: string, grade: Graded['grade'], source: string, verified: boolean, note?: string): Graded =>
  ({ value, unit, grade, source, verified, ...(note ? { note } : {}) });

export const SARS_COV_2: PathogenSpec = {
  id: 'sars-cov-2',
  name: 'SARS-CoV-2',
  kind: 'virus',
  // Per unit area, so this is ACE2/TMPRSS2 density, not the chance a given cell is infected.
  // ACE2 is largely confined to AT2 cells, and the 100 : 1 density here comes out as about
  // 3.6 : 1 per cell once an AT1's 28-fold greater area is counted — AT2 the preferred target,
  // AT1 still very much infectable, which is what destroys the barrier. The ratio is ours.
  tropism: { AT2: 1, AT1: 0.01 },
  infectivity: g(2e-4, 'per virion per min', 'D', `fitted so one focus spreads on the timescale of ${SIMCOV}`, false,
    'SIMCoV quotes 0.001 but defines it two different ways in the same paper'),
  eclipseMin: g(480, 'min', 'A', SIMCOV, true),
  producingMin: g(900, 'min', 'A', SIMCOV, true),
  apoptosisMin: g(180, 'min', 'A', SIMCOV, true),
  productionPerMin: g(1.1, 'virions per min', 'A', `${SIMCOV}: a burst of 1,000 over the producing period`, true),
  ifnAntagonism: g(0.6, 'fraction suppressed', 'C', 'SARS-CoV-2 suppresses the type-I interferon response', false),
  ifnSensitivity: g(0.9, 'fraction blocked at saturation', 'D', 'ours', true),
  sources: [SIMCOV, 'Getz et al. 2021, bioRxiv 2020.04.02.019075v5 (model structure)'],
};
