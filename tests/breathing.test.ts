import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { breathe, freshBreathing, volumeOf } from './helpers';
import { DEFAULT_BREATHING, breathWave, closingVolume, stepBreathing, targetVolume, type Breathing } from '../src/mech/breathing';
import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';

const feature = await loadFeature('features/breathing.feature');
const DT = 1 / 60;

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  let b: Breathing;
  const givenSac = (Given: (s: string, f: () => void) => void, text = 'a breathing alveolar sac') =>
    Given(text, () => { b = freshBreathing(14); });

  Scenario('Volume follows the breath', ({ Given, When, Then, And }) => {
    let worst = 0;
    givenSac(Given);
    When('it is breathed for three full breaths', () => {
      breathe(b, 3, DEFAULT_BREATHING, (s) => {
        const wave = breathWave(s.phase);
        for (let i = 0; i < s.acinus.alveoli.length; i++)
          worst = Math.max(worst, Math.abs(volumeOf(s, i) / targetVolume(s, i, wave) - 1));
      });
    });
    Then('every alveolus tracked its target within 5 percent throughout', () => expect(worst).toBeLessThan(0.05));
    And('the tidal volume of each is within 20 percent of what the tissue asks for', () => {
      for (let i = 0; i < b.lastTidal.length; i++) expect(Math.abs(b.lastTidal[i] / b.tidal[i] - 1)).toBeLessThan(0.2);
    });
  });

  Scenario('Pressure rises on inspiration and falls on expiration', ({ Given, When, Then, And }) => {
    let filling = 0, fillingCount = 0, atTop = 0, atBottom = 0;
    givenSac(Given);
    When('it is breathed for three full breaths', () => {
      breathe(b, 3, DEFAULT_BREATHING, (s) => {
        if (s.phase > 0.1 && s.phase < 0.4) { filling += s.pressure[0]; fillingCount++; }
        if (Math.abs(s.phase - 0.5) < 0.01) atTop = s.pressure[0];
        if (s.phase < 0.01) atBottom = s.pressure[0];
      });
    });
    Then('the pressure is positive while it is filling', () => expect(filling / fillingCount).toBeGreaterThan(0));
    And('the pressure is lower at the bottom of the breath than at the top', () => expect(atBottom).toBeLessThan(atTop));
  });

  ScenarioOutline('The breath does not depend on the number of substeps', ({ Given, When, Then }, v) => {
    const topVolumeWith = (substeps: number) => {
      const s = freshBreathing(14);
      let top = 0;
      breathe(s, 3, { ...DEFAULT_BREATHING, substeps }, (x) => {
        if (Math.abs(x.phase - 0.5) < 0.01) top = volumeOf(x, 0);
      });
      return top;
    };
    const reference = topVolumeWith(16);
    let got = 0;
    givenSac(Given);
    When('it is breathed for three full breaths with <substeps> substeps', () => { got = topVolumeWith(Number(v.substeps)); });
    Then('the volume at the top of the breath is within 1 percent of the volume with 16 substeps', () => {
      expect(Math.abs(got / reference - 1)).toBeLessThan(0.01);
    });
  });

  Scenario('Alveoli differ from one another, as measured', ({ Given, Then, And }) => {
    givenSac(Given);
    Then('their tidal volume fractions are not all the same', () => {
      expect(new Set(Array.from(b.tidal)).size).toBeGreaterThan(1);
      const lo = Math.min(...b.tidal), hi = Math.max(...b.tidal);
      expect(hi / lo).toBeGreaterThan(1.05);
    });
    And('every one of them is positive', () => { for (const t of b.tidal) expect(t).toBeGreaterThan(0); });
  });

  Scenario('Losing surfactant stiffens an alveolus and then collapses it', ({ Given, When, Then, And }) => {
    givenSac(Given);
    When('one alveolus loses its surfactant', () => {
      breathe(b, 1);
      b.surfactant[0] = 0;
      breathe(b, 3);
    });
    Then("its tidal volume falls well below its neighbours'", () => {
      const others = Array.from(b.lastTidal).slice(1).reduce((s, t) => s + t, 0) / (b.lastTidal.length - 1);
      expect(b.lastTidal[0]).toBeLessThan(0.5 * others);
    });
    And('it collapses while the others stay open', () => {
      expect(b.open[0]).toBe(0);
      for (let i = 1; i < b.open.length; i++) expect(b.open[i]).toBe(1);
    });
  });

  Scenario('A collapsed alveolus needs a real pressure to reopen', ({ Given, When, Then }) => {
    givenSac(Given, 'a breathing alveolar sac with one collapsed alveolus');
    let collapsedAfterRestore = true;
    When('its surfactant is restored but no extra pressure is applied', () => {
      b.surfactant[0] = 0;
      breathe(b, 4);
      expect(b.open[0]).toBe(0);
      b.surfactant[0] = 1;
      breathe(b, 3);
      collapsedAfterRestore = b.open[0] === 0;
    });
    Then('it stays collapsed', () => expect(collapsedAfterRestore).toBe(true));
    When('enough pressure is applied', () => {
      const peep = 2 * b.reopenPressure;
      for (let f = 0; f < Math.round((2 * b.periodS) / DT); f++) stepBreathing(b, DT, DEFAULT_BREATHING, peep);
    });
    Then('it opens again', () => expect(b.open[0]).toBe(1));
  });

  Scenario('Oedema takes up room an alveolus can no longer use', ({ Given, When, Then }) => {
    let before = 0, after = 0;
    givenSac(Given);
    When('one alveolus fills a quarter with fluid', () => {
      breathe(b, 2);
      before = volumeOf(b, 0);
      b.oedema[0] = 0.25;
      breathe(b, 3);
      after = volumeOf(b, 0);
    });
    Then('its volume falls by about a quarter', () => {
      expect(Math.abs(1 - after / before - 0.25)).toBeLessThan(0.05);
      expect(closingVolume(b, 0)).toBeGreaterThan(0);
      expect(ALVEOLAR_SAC.coupling.clearPerMin.grade).toBe('D');
    });
  });
});
