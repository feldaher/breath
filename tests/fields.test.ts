import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { sac } from './helpers';
import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';
import { makeFields, refitFields, stepField, totalAmount, type Fields } from '../src/fields/surface';
import type { Acinus } from '../src/tissue/acinus';

const feature = await loadFeature('features/fields.feature');

/** How much of a field sits on each alveolus. */
function byAlveolus(f: Fields, a: Acinus, id: 'virion' | 'ifn'): number[] {
  return a.alveoli.map((al) => {
    let t = 0;
    for (let v = al.nodes[0]; v < al.nodes[1]; v++) t += f.c[id][v] * f.area[v];
    return t;
  });
}

describeFeature(feature, ({ Scenario }) => {
  let a: Acinus, f: Fields;
  const given = (Given: (s: string, f: () => void) => void, text = 'fields over the sac') =>
    Given(text, () => { a = sac(14); f = makeFields(a, ALVEOLAR_SAC); });

  Scenario('A field put into one alveolus stays put without diffusion', ({ Given, When, Then }) => {
    given(Given);
    When('virions are placed in one alveolus and nothing is allowed to move', () => {
      for (let v = a.alveoli[0].nodes[0]; v < a.alveoli[0].nodes[1]; v++) f.c.virion[v] = 1;
      f.solver.step(f.c.virion, { D: 0, k: 0 }, 1440);
    });
    Then('all of them are still in that alveolus', () => {
      const per = byAlveolus(f, a, 'virion');
      const elsewhere = per.slice(1).reduce((s, x) => s + x, 0);
      expect(elsewhere / per[0]).toBeLessThan(1e-9);
    });
  });

  Scenario('A field crosses from one alveolus to its neighbours', ({ Given, When, Then, And }) => {
    let before = 0;
    given(Given);
    When('virions are placed in one alveolus and left to diffuse for a day', () => {
      for (let v = a.alveoli[0].nodes[0]; v < a.alveoli[0].nodes[1]; v++) f.c.virion[v] = 1;
      before = totalAmount(f, 'virion');
      const D = ALVEOLAR_SAC.fields[0].D.value * 60;
      for (let t = 0; t < 144; t++) f.solver.step(f.c.virion, { D, k: 0 }, 10);
    });
    Then('some of them have reached other alveoli', () => {
      const per = byAlveolus(f, a, 'virion');
      const elsewhere = per.slice(1).reduce((s, x) => s + x, 0);
      expect(elsewhere / before).toBeGreaterThan(0.001);
      expect(per.filter((x) => x / before > 1e-4).length).toBeGreaterThan(1);
    });
    And('none of them have been lost, with decay switched off', () => {
      expect(Math.abs(totalAmount(f, 'virion') / before - 1)).toBeLessThan(1e-9);
    });
  });

  Scenario('Virions are cleared at the measured rate', ({ Given, When, Then }) => {
    let before = 0, after = 0;
    const k = ALVEOLAR_SAC.fields[0].decay.value;
    given(Given);
    When('virions are spread evenly and left for 100 minutes', () => {
      f.c.virion.fill(1);
      before = totalAmount(f, 'virion');
      for (let t = 0; t < 1000; t++) stepField(f, 'virion', 0.1);
      after = totalAmount(f, 'virion');
    });
    Then('the amount left matches exp minus the clearance rate times the time', () => {
      expect(Math.abs(after / (before * Math.exp(-k * 100)) - 1)).toBeLessThan(0.01);
    });
  });

  Scenario('Stretching the sac dilutes what is on it', ({ Given, When, Then, And }) => {
    let before = 0, cBefore = 0;
    given(Given, 'fields over the sac with virions spread evenly');
    When('the sac is inflated and the fields are refitted', () => {
      f.c.virion.fill(1);
      before = totalAmount(f, 'virion');
      cBefore = f.c.virion[0];
      for (let i = 0; i < a.membrane.pos.length; i++) a.membrane.pos[i] *= 1.1;
      refitFields(f, a);
    });
    Then('the total amount is unchanged', () => expect(Math.abs(totalAmount(f, 'virion') / before - 1)).toBeLessThan(1e-9));
    And('the concentration has fallen', () => {
      // Area goes up by 1.1², so the concentration should fall by about the same.
      expect(Math.abs(f.c.virion[0] / (cBefore / 1.21) - 1)).toBeLessThan(0.02);
    });
  });
});
