import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { sac, seeded } from './helpers';
import { ALVEOLAR_SAC } from '../src/data/tissues/alveolar-sac';
import { SARS_COV_2 } from '../src/data/pathogens/sars-cov-2';
import { kindId, placeEpithelium } from '../src/cells/epithelium';
import { defaultLifecycle, stepCells } from '../src/cells/lifecycle';
import { CellState, type Epithelium } from '../src/contracts';

const feature = await loadFeature('features/lifecycle.feature');
const lp = defaultLifecycle(SARS_COV_2);

function fresh(): { epi: Epithelium; nodes: number } {
  const a = sac(20);
  return { epi: placeEpithelium(a, ALVEOLAR_SAC), nodes: a.membrane.invMass.length };
}
/** Runs the machine with no virions about, reporting when each state began. */
function followOne(kind: 'AT1' | 'AT2') {
  const { epi, nodes } = fresh();
  const i = [...Array(epi.n).keys()].find((k) => epi.kind[k] === kindId(kind))!;
  epi.state[i] = CellState.Eclipse;
  epi.timer[i] = SARS_COV_2.eclipseMin.value;
  const virion = new Float64Array(nodes), release = new Float64Array(nodes);
  const r = seeded(5);
  const began = new Map<number, number>([[CellState.Eclipse, 0]]);
  let released = 0;
  for (let t = 1; t <= 3000; t++) {
    const before = epi.state[i];
    stepCells(epi, virion, 1, lp, r, release);
    released += release[epi.node[i]];
    if (epi.state[i] !== before) began.set(epi.state[i], t);
  }
  return { epi, i, began, released };
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('An infected cell runs through its states in the measured times', ({ Given, When, Then, And }) => {
    let run: ReturnType<typeof followOne>;
    Given('one infected cell and no virions around it', () => {});
    When('it is followed minute by minute', () => { run = followOne('AT2'); });
    Then('it stays in eclipse for about 480 minutes', () => {
      expect(run.began.get(CellState.Producing)!).toBeGreaterThan(0.8 * 480 - 2);
      expect(run.began.get(CellState.Producing)!).toBeLessThan(1.2 * 480 + 2);
    });
    And('it then releases virions for about 900 minutes', () => {
      const span = run.began.get(CellState.Apoptotic)! - run.began.get(CellState.Producing)!;
      expect(span).toBeGreaterThan(0.8 * 900 - 2);
      expect(span).toBeLessThan(1.2 * 900 + 2);
    });
    And('it is dead about 180 minutes after that', () => {
      const span = run.began.get(CellState.Dead)! - run.began.get(CellState.Apoptotic)!;
      expect(span).toBeGreaterThan(0.8 * 180 - 2);
      expect(span).toBeLessThan(1.2 * 180 + 2);
    });
  });

  Scenario('A producing cell makes a burst of about a thousand virions', ({ Given, When, Then }) => {
    let run: ReturnType<typeof followOne>;
    Given('one infected cell and no virions around it', () => {});
    When('it is followed to its death', () => { run = followOne('AT2'); });
    Then('it released about 1000 virions in all', () => {
      expect(run.released).toBeGreaterThan(700);
      expect(run.released).toBeLessThan(1300);
    });
  });

  Scenario('A dead AT1 leaves bare membrane and a dead AT2 does not', ({ Given, When, Then }) => {
    let at1: ReturnType<typeof followOne>, at2: ReturnType<typeof followOne>;
    Given('one infected AT1 cell and one infected AT2 cell', () => {});
    When('both are followed to their death', () => { at1 = followOne('AT1'); at2 = followOne('AT2'); });
    Then('the AT1 is denuded and the AT2 is merely dead', () => {
      expect(at1.epi.state[at1.i]).toBe(CellState.Denuded);
      expect(at2.epi.state[at2.i]).toBe(CellState.Dead);
    });
  });

  Scenario('Infection needs virions, and more of them infect sooner', ({ Given, When, Then, And }) => {
    let epi: Epithelium, nodes = 0;
    const infectedCount = (e: Epithelium) => [...Array(e.n).keys()].filter((i) => e.state[i] !== CellState.Healthy).length;
    const bathe = (dose: number, minutes: number) => {
      const f = fresh();
      const virion = new Float64Array(f.nodes).fill(dose), release = new Float64Array(f.nodes);
      const r = seeded(9);
      for (let t = 0; t < minutes; t++) stepCells(f.epi, virion, 1, lp, r, release);
      return infectedCount(f.epi);
    };
    Given('a healthy epithelium', () => { const f = fresh(); epi = f.epi; nodes = f.nodes; });
    When('it is left in clean fluid for a day', () => {
      const virion = new Float64Array(nodes), release = new Float64Array(nodes);
      const r = seeded(9);
      for (let t = 0; t < 1440; t++) stepCells(epi, virion, 1, lp, r, release);
    });
    Then('nothing is infected', () => expect(infectedCount(epi)).toBe(0));
    When('it is bathed in virions for an hour', () => {});
    Then('some cells are infected', () => expect(bathe(0.02, 60)).toBeGreaterThan(0));
    And('a heavier dose infects more of them', () => expect(bathe(0.2, 60)).toBeGreaterThan(bathe(0.02, 60)));
  });

  Scenario('The virus prefers the cells it has a tropism for', ({ Given, When, Then }) => {
    let f: ReturnType<typeof fresh>;
    Given('a healthy epithelium bathed in virions', () => { f = fresh(); });
    When('an hour passes', () => {
      const virion = new Float64Array(f.nodes).fill(0.05), release = new Float64Array(f.nodes);
      const r = seeded(21);
      for (let t = 0; t < 60; t++) stepCells(f.epi, virion, 1, lp, r, release);
    });
    Then('far more AT2 cells are infected than AT1 cells, per cell', () => {
      const rate = (kind: 'AT1' | 'AT2') => {
        const all = [...Array(f.epi.n).keys()].filter((i) => f.epi.kind[i] === kindId(kind));
        return all.filter((i) => f.epi.state[i] !== CellState.Healthy).length / all.length;
      };
      // Tropism is per unit area and an AT1 cell is about 28 times larger, so the density ratio
      // has to be large before AT2 come out as the preferred target per cell. Both are infected.
      expect(rate('AT2')).toBeGreaterThan(2 * rate('AT1'));
      expect(rate('AT1')).toBeGreaterThan(0);
    });
  });

  Scenario('Interferon protects a cell', ({ Given, When, Then }) => {
    let f: ReturnType<typeof fresh>;
    Given('a healthy epithelium bathed in virions', () => { f = fresh(); });
    When('half the cells are fully protected and an hour passes', () => {
      for (let i = 0; i < f.epi.n; i += 2) f.epi.prot[i] = 1;
      const virion = new Float64Array(f.nodes).fill(0.1), release = new Float64Array(f.nodes);
      const r = seeded(33);
      for (let t = 0; t < 60; t++) stepCells(f.epi, virion, 1, lp, r, release);
    });
    Then('many fewer of the protected cells are infected', () => {
      let prot = 0, bare = 0, protN = 0, bareN = 0;
      for (let i = 0; i < f.epi.n; i++) {
        const hit = f.epi.state[i] !== CellState.Healthy ? 1 : 0;
        if (f.epi.prot[i] > 0) { prot += hit; protN++; } else { bare += hit; bareN++; }
      }
      expect(bareN).toBeGreaterThan(0);
      expect(prot / protN).toBeLessThan(0.5 * (bare / bareN));
    });
  });
});
