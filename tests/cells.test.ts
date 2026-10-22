import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { sac } from './helpers';
import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';
import { areaShare, EPI_KINDS, kindId, placeEpithelium } from '../src/cells/epithelium';
import { membraneArea } from '@feldaher/cell-engine/physics/membrane';
import type { Epithelium } from '../src/contracts';

const feature = await loadFeature('features/cells.feature');

describeFeature(feature, ({ Scenario }) => {
  let epi: Epithelium;
  const given = (Given: (s: string, f: () => void) => void) =>
    Given('an epithelium over the sac', () => { epi = placeEpithelium(sac(14), ALVEOLAR_SAC); });

  Scenario('Every alveolus carries the measured number of cells', ({ Given, Then, And }) => {
    given(Given);
    Then('each alveolus has 40 AT1 cells and 77 AT2 cells', () => {
      const a = sac(14);
      for (let al = 0; al < a.alveoli.length; al++) {
        let at1 = 0, at2 = 0;
        for (let i = 0; i < epi.n; i++) if (epi.alveolus[i] === al) {
          if (epi.kind[i] === kindId('AT1')) at1++;
          if (epi.kind[i] === kindId('AT2')) at2++;
        }
        expect(at1).toBe(40);
        expect(at2).toBe(77);
      }
    });
    And('every cell belongs to exactly one alveolus', () => {
      expect(epi.n).toBe(117 * sac(14).alveoli.length);
      for (let i = 0; i < epi.n; i++) expect(epi.alveolus[i]).toBeLessThan(sac(14).alveoli.length);
    });
    And('every cell sits on the surface of its own alveolus', () => {
      const a = sac(14);
      for (let i = 0; i < epi.n; i++) {
        const c = a.alveoli[epi.alveolus[i]].centre;
        const d = Math.hypot(epi.centre[3 * i] - c[0], epi.centre[3 * i + 1] - c[1], epi.centre[3 * i + 2] - c[2]);
        expect(Math.abs(d / a.plan.radiusUm - 1)).toBeLessThan(0.1);
      }
    });
  });

  Scenario('AT1 cells hold almost all of the surface', ({ Given, Then, And }) => {
    given(Given);
    Then('AT1 cells hold 93 to 94 percent of the area', () => {
      const share = areaShare(epi).get(kindId('AT1'))!;
      expect(share).toBeGreaterThan(0.93);
      expect(share).toBeLessThan(0.94);
    });
    And('the areas add up to the area of the sac', () => {
      let total = 0;
      for (let i = 0; i < epi.n; i++) total += epi.areaUm2[i];
      expect(Math.abs(total / membraneArea(sac(14).membrane) - 1)).toBeLessThan(1e-5);
    });
    And('an AT1 cell is far larger than an AT2 cell', () => {
      const at1 = epi.areaUm2[[...Array(epi.n).keys()].find((i) => epi.kind[i] === kindId('AT1'))!];
      const at2 = epi.areaUm2[[...Array(epi.n).keys()].find((i) => epi.kind[i] === kindId('AT2'))!];
      expect(at1 / at2).toBeGreaterThan(20);
    });
  });

  Scenario('Refining the mesh does not change the epithelium', ({ Given, Then, And }) => {
    let coarse: Epithelium, fine: Epithelium;
    Given('epithelia over sacs meshed at 20 and at 14 micrometres', () => {
      coarse = placeEpithelium(sac(20), ALVEOLAR_SAC);
      fine = placeEpithelium(sac(14), ALVEOLAR_SAC);
    });
    Then('both have the same number of cells', () => expect(coarse.n).toBe(fine.n));
    And('the cells hold the same share of the area', () => {
      for (const k of [kindId('AT1'), kindId('AT2')])
        expect(Math.abs(areaShare(coarse).get(k)! - areaShare(fine).get(k)!)).toBeLessThan(0.005);
    });
  });

  Scenario('Every cell is tied to a node it can read and secrete at', ({ Given, Then, And }) => {
    given(Given);
    Then("each cell's node belongs to its own alveolus", () => {
      const a = sac(14);
      for (let i = 0; i < epi.n; i++) {
        const [n0, n1] = a.alveoli[epi.alveolus[i]].nodes;
        expect(epi.node[i]).toBeGreaterThanOrEqual(n0);
        expect(epi.node[i]).toBeLessThan(n1);
      }
    });
    And('the node is one of the closest to the cell', () => {
      const a = sac(14), m = a.membrane;
      for (let i = 0; i < epi.n; i += 37) {
        const [n0, n1] = a.alveoli[epi.alveolus[i]].nodes;
        let best = Infinity;
        for (let v = n0; v < n1; v++) best = Math.min(best, Math.hypot(m.pos[3 * v] - epi.centre[3 * i], m.pos[3 * v + 1] - epi.centre[3 * i + 1], m.pos[3 * v + 2] - epi.centre[3 * i + 2]));
        const got = Math.hypot(m.pos[3 * epi.node[i]] - epi.centre[3 * i], m.pos[3 * epi.node[i] + 1] - epi.centre[3 * i + 1], m.pos[3 * epi.node[i] + 2] - epi.centre[3 * i + 2]);
        expect(got).toBeCloseTo(best, 4);
      }
      expect(EPI_KINDS[0]).toBe('AT1');
    });
  });
});
