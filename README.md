# Swarm area coverage — web

A browser port of the [swarm-area-coverage](../swarm-area-coverage) JavaFX
simulator for the "Confidence model" proposed in
[Swarm-based Area Exploration and Coverage based on Pheromones and Bird Flocks](https://www.diva-portal.org/smash/record.jsf?pid=diva2%3A676835&dswid=-6923).

No build step, no dependencies. Open `index.html` in a browser, or serve the
folder from any static host.

```
xdg-open index.html          # or just double-click it
python3 -m http.server 8000  # if you would rather use http://
```

## The model

A 700×700 world on a 5px grid (140×140 cells). Every iteration each agent:

1. drops pheromone over the ground it is standing on;
2. reacts to the nearest band another agent falls in — **personal range** (back
   away), **comfort range** (orbit it), **flock range** (note it if it is more
   confident than anyone seen so far);
3. moves toward the most confident agent it found, blended with its own
   **inertia**; and
4. recomputes its confidence: how much of the area it covers is *not* yet
   marked, plus a share (**influence**) of the confidence of the agent it is
   following, plus 10% for having been able to move at all.

Agents drawn in red are leading — nobody nearby was more confident. Pheromone
trails evaporate at a fixed rate each iteration, so coverage decays if nobody
comes back.

## Using it

| | |
|---|---|
| **Start / Pause** | `Space` |
| **Reset** | `R` — reseeds the swarm and clears trails; walls stay |
| **Show grid** | `G` |
| **Paint walls** | drag on the world **while paused**. Starting the drag on an existing wall erases instead. |
| **Drop a leak** | click or drag on the world **while running**. Leaks bleed into their neighbours and the swarm cleans them up. |

**Map** offers five generated presets, plus anything you save. **Save…** stores
the painted walls in `localStorage`; **Clear walls** empties the map. **Export
CSV** dumps the coverage series behind the chart.

`Agents` and `Agent width` only take effect on the next reset — as in the
original, the swarm is built once when a run starts.

## Layout

| File | |
|---|---|
| `src/utils.js` | geometry and random helpers (`Utils.java`) |
| `src/grid.js` | the cell matrix, as flat typed arrays (`GridCell.java`) |
| `src/agent.js` | one swarm member (`Agent.java`) |
| `src/world.js` | grid + swarm + one iteration (`SwarmWorld.java`) |
| `src/renderer.js` | canvas drawing |
| `src/presets.js` | generated wall layouts |
| `src/storage.js` | saved worlds in `localStorage` |
| `src/chart.js` | the coverage plot |
| `src/main.js` | controls, loop, pointer input (`SwarmWorldController.java` + `SwarmWorld.fxml`) |

Plain classic `<script>` tags rather than ES modules, so the page also works
straight off the filesystem, where module loading is blocked by CORS.

## What differs from the JavaFX version

The model and its formulas are unchanged. Two sliders were retuned (agent
count and speed); the rest keep Java's ranges and defaults. These are the
deliberate departures.

**Bugs fixed**

- **Cell bounds were undersized.** `GridCell` computed its collision radius as
  `CELL_SIZE/2` with `CELL_SIZE` declared `int`, so the radius was 2 instead of
  2.5. Among other things this made a leak spread to its 4 orthogonal
  neighbours instead of all 8; leaks now spread as round blobs rather than
  diamonds.
- **Frame rate.** The Java timeline was built with a keyframe of `1000/fps` ms
  *and* had its playback rate scaled by `fps/6`, so the two compounded and the
  slider did not mean fps. The loop now advances at exactly the requested rate.
  The agent-count slider also used to call `updateFps()`; it no longer does.
- **Coverage could exceed 100%.** Walls were counted as covered when an agent
  overlapped them, while also being subtracted from the denominator. Walls are
  now never marked as covered, and a cell that becomes a wall stops counting as
  covered.
- **Division by zero** in the coverage ratio, in leak spreading, and in the
  pheromone/leak density readings; and **NaN** out of `newPointInLine` when the
  two points coincided.
- **Area scans** derived their bounding box from a truncated, already-clamped
  corner, which could drop a column at the left or top edge.

**Deliberately kept**

- `pheromoneLevelAt` divides by *every* cell in the area, not just the marked
  ones. That is what makes it a mean density, which is what agent confidence is
  built on — changing it would change the model, not fix it.
- Agents still spawn bunched in the middle of the world, in the same 200px box.
- Pheromone cells never return to blank; they decay asymptotically and stay
  faintly visible, which is what makes a coverage map readable.

**Interface**

- **Reset keeps the walls.** In Java, `refresh()` reloaded the selected world
  and threw away anything you had painted. Picking a map from the dropdown
  loads it; resetting only restarts the run.
- The world list is real. Java read it from a `worlds.txt` that was never
  shipped, so it only ever offered "Empty".
- **The agent slider runs 1–200, defaulting to 100** — Java's ran 1–80 from 50.
  The interaction loop is O(n²), so a step costs ~4ms at the default, ~13ms at
  200 agents, and ~20ms at 200 with every range slider maxed: all inside the
  40ms a step gets at the top speed setting, and well inside the 67ms it gets
  at the default 15.
- **Speed defaults to 15fps**, up from Java's 10. The range is unchanged, 1–25.
- **The world is 700×700**, up from Java's 600×600 — 19,600 cells rather than
  14,400. Set `WORLD_WIDTH` / `WORLD_HEIGHT` in `src/main.js` to change it, and
  keep the canvas's `width`/`height` attributes and the `--world-width` custom
  property in step.
- The status line, run statistics and coverage chart sit in a column to the
  right of the world, dropping back underneath it below 1180px of viewport
  width.
- **Agents no longer spawn inside walls.** They are placed in the same middle
  box as before, but a spot that collides with a wall is re-rolled — an agent
  buried in a wall has every move refused, so it would sit dead for the whole
  run. On the Pillars preset at 150 agents that was 7 of them.
- Added: wall presets, saving worlds, a brush size (5px cells are tedious to
  paint one at a time), a coverage-over-time chart with CSV export, a dark
  canvas theme, and keyboard shortcuts.

## Cite

`Ventocilla, E. (2013). Swarm-based Area Exploration and Coverage based on Pheromones and Bird Flocks (Dissertation)`

## License

GPL-3.0, same as the original.
