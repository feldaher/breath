import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { pieces, sac, spec } from './helpers';
import { isClosed } from '@feldaher/cell-engine/mesh/boundary';
import { cavityVolume } from '@feldaher/cell-engine/physics/cavity';
import type { Acinus } from '../src/tissue/acinus';

const feature = await loadFeature('features/geometry.feature');
const MEAN_ALVEOLUS = 4.2e6;   // µm³, Ochs et al. 2004

describeFeature(feature, ({ Scenario }) => {
  let a: Acinus;

  Scenario('Every alveolus encloses the measured alveolar volume', ({ Given, Then, And }) => {
    Given('an alveolar sac meshed at 14 micrometres', () => { a = sac(14); });
    Then('it has as many alveoli as the tissue asks for', () => {
      const geo = spec().geometry;
      expect(a.alveoli).toHaveLength(geo.kind === 'acinus' ? geo.nAlveoli : 0);
    });
    And('every alveolus is a closed surface', () => {
      for (const al of a.alveoli) expect(isClosed(al.tris)).toBe(true);
    });
    And('every alveolus encloses 4.2e6 cubic micrometres, the measured mean', () => {
      for (const al of a.alveoli) {
        expect(Math.abs(al.restVolumeUm3 / MEAN_ALVEOLUS - 1)).toBeLessThan(0.01);
        expect(Math.abs(cavityVolume(a.membrane.pos, al.tris) / al.restVolumeUm3 - 1)).toBeLessThan(1e-6);
      }
    });
  });

  Scenario('The sac is one connected body', ({ Given, Then, And }) => {
    Given('an alveolar sac meshed at 14 micrometres', () => { a = sac(14); });
    Then('every alveolus is welded to at least one neighbour', () => {
      const linked = new Set(a.welds.flatMap((w) => [w.a, w.b]));
      for (let i = 0; i < a.alveoli.length; i++) expect(linked.has(i)).toBe(true);
    });
    And('the welds join all of them into a single piece', () => expect(pieces(a)).toBe(1));
    And('every weld joins two different alveoli', () => {
      for (const w of a.welds) {
        expect(w.a).not.toBe(w.b);
        expect(w.i).not.toBe(w.j);
      }
    });
  });

  Scenario('Refining the mesh does not change the sac', ({ Given, Then, And }) => {
    let coarse: Acinus, fine: Acinus;
    Given('alveolar sacs meshed at 14 and at 9 micrometres', () => { coarse = sac(14); fine = sac(9); });
    Then('both enclose the same volume per alveolus', () => {
      for (let i = 0; i < coarse.alveoli.length; i++)
        expect(Math.abs(coarse.alveoli[i].restVolumeUm3 / fine.alveoli[i].restVolumeUm3 - 1)).toBeLessThan(0.01);
    });
    And('both are a single piece', () => { expect(pieces(coarse)).toBe(1); expect(pieces(fine)).toBe(1); });
    And('the finer one has more nodes', () => expect(fine.membrane.invMass.length).toBeGreaterThan(coarse.membrane.invMass.length));
  });

  Scenario('One alveolus is a sac of one', ({ Given, Then, And }) => {
    Given('an alveolar sac of a single alveolus', () => { a = sac(14, 1); });
    Then('it has one alveolus at the origin', () => {
      expect(a.alveoli).toHaveLength(1);
      expect(Math.hypot(...a.alveoli[0].centre)).toBeCloseTo(0, 6);
    });
    And('there are no welds', () => expect(a.welds).toHaveLength(0));
  });
});
