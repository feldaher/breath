// One acinus: eight alveoli around a terminal duct. Every number carries where it came from
// (../../../outputs/literature/2026-10-20_lung-infection-parameters.md).

import type { Graded, TissueSpec } from '../../contracts';

const CRAPO = 'Crapo et al. 1982, Am Rev Respir Dis 126:332, Table 2 (whole lung), divided by Ochs et al. 2004';
const OCHS = 'Ochs et al. 2004, Am J Respir Crit Care Med 169:120';

const g = (value: number, unit: string, grade: Graded['grade'], source: string, verified: boolean, note?: string): Graded =>
  ({ value, unit, grade, source, verified, ...(note ? { note } : {}) });

/** Ours: every coupling constant of E14-E16 is a modelling choice, not a measurement. */
const ours = (value: number, unit: string, note: string): Graded => g(value, unit, 'D', 'ours', true, note);

export const ALVEOLAR_SAC: TissueSpec = {
  id: 'alveolar-sac',
  name: 'Alveolar sac',
  geometry: {
    kind: 'acinus',
    nAlveoli: 8,
    // A sphere of the measured mean alveolar volume 4.2e6 um^3 has radius 100 um.
    alveolusRadiusUm: g(100, 'µm', 'B', OCHS, true, 'radius of a sphere of the measured mean alveolar volume'),
    ductRadiusUm: g(45, 'µm', 'D', 'ours', true, 'drawn so the alveoli open into a visible duct'),
    // The measured septum is 12 +- 3 um and the air-blood barrier 2.2 um; both are far thinner
    // than a two-tet shell can be. Drawn thick on purpose, and labelled.
    // Thick on purpose: the shell must hold two tetrahedra across, and at the measured thickness
    // that would cost about 150,000 of them. See outputs/design for the arithmetic.
    wallUm: g(40, 'µm', 'D', 'ours', true, 'display mechanics: the measured alveolar septum is 12 ± 3 µm (Gehr et al. 1978)'),
    seed: 7,
  },
  epithelium: [
    { kind: 'AT1', perAlveolus: g(40, 'cells', 'B', CRAPO, true), areaUm2: g(5098, 'µm²', 'A', CRAPO, true) },
    { kind: 'AT2', perAlveolus: g(77, 'cells', 'B', CRAPO, true), areaUm2: g(183, 'µm²', 'A', CRAPO, true) },
  ],
  resident: [
    // Crapo gives 48 per alveolus, Hume et al. 2020 about 29; mouse imaging says fewer than one.
    // The low end of the human range is used and the card says so.
    { kind: 'AM', perAlveolus: g(30, 'cells', 'C', `${CRAPO}; Hume et al. 2020, Am J Respir Crit Care Med 201:1209`, true, 'sources disagree: 29–48 per alveolus in human lungs, fewer than one per alveolus in mouse imaging') },
  ],
  mechanics: {
    breathPeriodS: 3.5,
    tidalVolumeFraction: g(0.067, 'fraction of volume', 'S', 'tracking X-ray microscopy in intact mice: 6.7 ± 4.7 %', false),
    tidalSpread: 0.3,
    closingVolumeFrac: ours(0.55, 'fraction of resting volume', 'no measured closing volume for a healthy alveolus'),
    // Above any tidal peak in a healthy sac (about 5 cmH₂O, and 8.5 for the stiffest alveolus),
    // and well below a clinical recruitment manoeuvre of 30–45 cmH₂O.
    reopenPressure: ours(15, 'cmH₂O', 'the clinical literature gives opening pressures for injured lungs only'),
  },
  coupling: {
    surfactantTauMin: ours(240, 'min', 'surfactant turnover, order of hours'),
    surfactantExponent: ours(1.5, '1', 'shape of E16'),
    restingVolumeLoss: ours(0.6, 'fraction of resting volume', 'surface tension rises as surfactant is lost, so the alveolus holds less at the same pressure; this is what takes it below its closing volume'),
    leakPerMin: ours(0.004, 'per min', 'rate of oedema with a fully denuded alveolus'),
    clearPerMin: ours(0.002, 'per min', 'clearance of alveolar fluid'),
    closingVolumeGain: ours(0.5, '1', 'how much losing surfactant raises the closing volume'),
    reopenPressureGain: ours(1.5, '1', 'how much losing surfactant raises the opening pressure'),
  },
  fields: [
    {
      id: 'virion',
      // SIMCoV's own parameter is a fraction per minute on a 5 um lattice; the 0.0312 um^2/s they
      // derive from it is lattice-bound, and Stokes-Einstein for a 100 nm virion in water gives
      // about 4.4 um^2/s. We take a value between the two and treat it as unsettled.
      D: g(0.5, 'µm²/s', 'D', 'between SIMCoV\'s lattice-derived 0.0312 and Stokes–Einstein\'s 4.4 µm²/s', true, 'the single most uncertain number in the model'),
      decay: g(0.004, 'per min', 'A', 'Moses et al. 2021, PLoS Comput Biol 17:e1009735, Table 2', true),
      scheme: 'implicit',
    },
    {
      id: 'ifn',
      D: g(2, 'µm²/s', 'D', 'ours: a small signalling protein, faster than a virion', true),
      decay: g(0.01, 'per min', 'D', 'ours, by analogy with SIMCoV\'s inflammatory signal (half-life ≈ 70 min)', true),
      scheme: 'implicit',
    },
  ],
};
