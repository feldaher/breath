import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { World } from '../src/sim/world';
import { READOUTS, sampleAll } from '../src/game/readouts';
import { kindId } from '../src/cells/epithelium';
import { CellState } from '../src/contracts';

const feature = await loadFeature('features/infection.feature');
const DAY = 1440;

/** Runs the disease clock only; the mechanics do not need real time for these. */
function run(w: World, minutes: number) {
  for (let t = 0; t < minutes; t++) w.stepBio(1);
}
const world = (seed = 7) => new World({ spacingUm: 20, seed });

/** Kills a share of one alveolus's cells of a kind outright. */
function kill(w: World, alveolus: number, kind: 'AT1' | 'AT2', share: number) {
  const dead = kind === 'AT1' ? CellState.Denuded : CellState.Dead;
  const mine = [...Array(w.epi.n).keys()].filter((i) => w.epi.alveolus[i] === alveolus && w.epi.kind[i] === kindId(kind));
  for (const i of mine.slice(0, Math.round(share * mine.length))) w.epi.state[i] = dead;
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('A single infected cell starts a spreading focus', ({ Given, When, Then, And }) => {
    let w: World, seeded = 0;
    Given('a sac with one infected cell', () => { w = world(); seeded = w.infect(1).length; });
    When('five days pass', () => run(w, 5 * DAY));
    Then('many more cells are infected than were seeded', () => {
      const touched = [...Array(w.epi.n).keys()].filter((i) => w.epi.state[i] !== CellState.Healthy).length;
      expect(seeded).toBe(1);
      expect(touched).toBeGreaterThan(10);
    });
    And('virions have reached alveoli other than the one it started in', () => {
      const per = w.acinus.alveoli.map((al) => {
        let t = 0;
        for (let v = al.nodes[0]; v < al.nodes[1]; v++) t += w.fields.c.virion[v] * w.fields.area[v];
        return t;
      });
      const total = per.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(per.slice(1).reduce((a, b) => a + b, 0) / total).toBeGreaterThan(1e-4);
    });
    And('some cells have died', () => {
      const dead = [...Array(w.epi.n).keys()].filter((i) => w.epi.state[i] === CellState.Dead || w.epi.state[i] === CellState.Denuded).length;
      expect(dead).toBeGreaterThan(0);
    });
  });

  Scenario('Nothing happens without a virus', ({ Given, When, Then, And }) => {
    let w: World;
    Given('a healthy sac', () => { w = world(); });
    When('five days pass', () => run(w, 5 * DAY));
    Then('no cell is infected', () => {
      for (let i = 0; i < w.epi.n; i++) expect(w.epi.state[i]).toBe(CellState.Healthy);
    });
    And('every alveolus is still open', () => { for (const o of w.breathing.open) expect(o).toBe(1); });
    And('gas exchange is still whole', () => expect(sampleAll(w.snapshot()).gasExchange).toBeCloseTo(1, 3));
  });

  Scenario("Killing AT2 cells costs an alveolus its surfactant and then its volume", ({ Given, When, Then, And }) => {
    let w: World;
    Given('a sac whose first alveolus has lost most of its AT2 cells', () => { w = world(); kill(w, 0, 'AT2', 0.9); });
    When('a day passes', () => run(w, DAY));
    Then('that alveolus has little surfactant left', () => {
      expect(w.breathing.surfactant[0]).toBeLessThan(0.2);
      expect(w.breathing.surfactant[1]).toBeGreaterThan(0.9);
    });
    And('it breathes less than its neighbours', () => {
      const wave = 1;
      const target = (i: number) => w.breathing.tidal[i] * Math.pow(w.breathing.surfactant[i], w.breathing.surfactantExponent) * wave;
      expect(target(0)).toBeLessThan(0.2 * target(1));
    });
  });

  Scenario('Dead AT1 cells bare the membrane and let fluid in', ({ Given, When, Then, And }) => {
    let w: World, before = 0;
    Given('a sac whose first alveolus has lost most of its AT1 cells', () => {
      w = world();
      before = sampleAll(w.snapshot()).gasExchange;
      kill(w, 0, 'AT1', 0.9);
    });
    When('a day passes', () => run(w, DAY));
    Then('that alveolus has taken on fluid', () => {
      expect(w.breathing.oedema[0]).toBeGreaterThan(0.1);
      expect(w.breathing.oedema[1]).toBeLessThan(0.01);
    });
    And('gas exchange has fallen', () => expect(sampleAll(w.snapshot()).gasExchange).toBeLessThan(before - 0.05));
  });

  Scenario('The readouts agree with the state they are read from', ({ Given, When, Then, And }) => {
    let w: World;
    Given('a sac with one infected cell', () => { w = world(); w.infect(1); });
    When('five days pass', () => run(w, 5 * DAY));
    Then('every readout is a number between zero and its largest sensible value', () => {
      const s = sampleAll(w.snapshot());
      for (const r of READOUTS) {
        expect(Number.isFinite(s[r.id])).toBe(true);
        expect(s[r.id]).toBeGreaterThanOrEqual(0);
        if (r.unit === 'fraction' || r.unit.startsWith('fraction')) expect(s[r.id]).toBeLessThanOrEqual(1);
      }
    });
    And('the same snapshot always gives the same readings', () => {
      const a = sampleAll(w.snapshot()), b = sampleAll(w.snapshot());
      for (const r of READOUTS) expect(b[r.id]).toBe(a[r.id]);
    });
  });

  Scenario('An antiviral given early saves cells', ({ Given, When, Then }) => {
    let untreated = 0, treated = 0;
    const aliveAfter = (production: number) => {
      const w = world(3);
      w.lifecycle.productionScale = production;
      w.infect(3);
      run(w, 5 * DAY);
      return [...Array(w.epi.n).keys()].filter((i) => w.epi.state[i] !== CellState.Dead && w.epi.state[i] !== CellState.Denuded).length;
    };
    Given('two identical sacs, each with one infected cell', () => {});
    When('one of them is given an antiviral at the start and five days pass', () => {
      untreated = aliveAfter(1);
      treated = aliveAfter(0.1);
    });
    Then('the treated sac keeps more of its cells alive', () => expect(treated).toBeGreaterThan(untreated));
  });
});
