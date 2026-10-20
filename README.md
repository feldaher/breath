# Breath

A piece of lung you can hold, breathe and infect, in the browser.

An acinus of eight alveoli breathes as a soft membrane; a respiratory virus spreads across its epithelium; macrophages patrol it; interferon walls the infection off, or arrives too late; and alveoli that lose their surfactant stiffen, shrink and collapse. You change the medium — an antiviral, interferon at an hour of your choosing — and watch what it costs.

Built on [cell-engine](https://github.com/feldaher/cell-engine), the soft-body engine behind [Jelly Cells](https://github.com/feldaher/jelly-cells).

## What is modelled, and how well

Every number carries where it came from and how far it was checked, from **A** (read at the source) to **D** (our own modelling choice), and the cards in the app say so.

- **Measured (A/B):** the alveolus (4.2 × 10⁶ µm³, Ochs et al. 2004), its cells (40 AT1 of 5,098 µm² and 77 AT2 of 183 µm² per alveolus, from Crapo et al. 1982 ÷ Ochs), and the infection's timings (eclipse 480 min → producing 900 min at 1.1 virions/min → apoptosis 180 min, from SIMCoV).
- **Ours (D):** every law that couples damage to mechanics, the interferon response, and the gas-exchange proxy. The tests on those assert a direction, not a curve.

Sources: [`../outputs/literature/`](../outputs/literature/). The model, equation by equation: [`../outputs/theory/`](../outputs/theory/). Why it is built this way, including what was measured and rejected: [`../outputs/design/`](../outputs/design/).

**It is not a predictor of a human infection.** It is a sandbox for seeing how the pieces push on each other.

## Run

```sh
npm install
npm run dev        # http://localhost:5173/breath/
npm test           # Gherkin scenarios (vitest)
npm run build      # static site in dist/
```

To work on the engine at the same time, clone it next door (`projects/cell-engine/engine`) and run `CELL_ENGINE=local npm run dev`.

## Where it is

Phase 1, in progress. The sac is built and breathes: eight closed membrane bubbles welded into one body, each holding the measured alveolar volume, each with its own tidal excursion, collapsing when it loses surfactant and needing a real pressure to reopen. Cells, fields, macrophages, interventions and challenges come next.
