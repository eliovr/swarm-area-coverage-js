'use strict';

/* Wiring: controls -> world parameters, the animation loop, and the pointer
 * interaction that lets you paint walls while paused and drop leaks while the
 * simulation runs. Replaces SwarmWorldController.java and SwarmWorld.fxml. */

/* World size in pixels. Both must be multiples of CELL_SIZE. Keep the canvas's
 * width/height attributes and the --world-width custom property in step with
 * these — the canvas takes its display aspect ratio from those attributes. */
const WORLD_WIDTH = 700;
const WORLD_HEIGHT = 700;
/* Never advance more than this many iterations in one animation frame, so a
 * backgrounded tab does not come back and freeze catching up. */
const MAX_STEPS_PER_FRAME = 5;

const world = new SwarmWorld(WORLD_WIDTH, WORLD_HEIGHT);
const renderer = new Renderer(document.getElementById('world'), world);
const chart = new CoverageChart(
    document.getElementById('chart'),
    document.getElementById('chartTooltip')
);

const ui = {
    startPause: document.getElementById('btnStartPause'),
    reset: document.getElementById('btnReset'),
    saveWorld: document.getElementById('btnSaveWorld'),
    deleteWorld: document.getElementById('btnDeleteWorld'),
    clearWalls: document.getElementById('btnClearWalls'),
    csv: document.getElementById('btnCsv'),
    worldSelect: document.getElementById('selWorld'),
    brush: document.getElementById('selBrush'),
    theme: document.getElementById('selTheme'),
    grid: document.getElementById('chkGrid'),
    hint: document.getElementById('hint'),
    canvas: document.getElementById('world'),
    coverage: document.getElementById('statCoverage'),
    iterations: document.getElementById('statIterations'),
    agents: document.getElementById('statAgents'),
    leaders: document.getElementById('statLeaders'),
    walls: document.getElementById('statWalls')
};

let running = false;
let accumulator = 0;
let lastFrame = performance.now();
let painting = null;
let lastPaintPoint = null;
/* While paused nothing moves, so the canvas is only repainted when something
 * actually changed it. */
let needsRender = true;

// ====== parameters =========================================================

for (const input of document.querySelectorAll('input[type="range"][data-param]')) {
    const output = input.parentElement.querySelector('output');

    const sync = () => {
        world.params[input.dataset.param] = Number(input.value);
        output.textContent = input.value;
    };

    input.addEventListener('input', sync);
    sync();
}

// ====== run control ========================================================

function setRunning(next) {
    running = next;
    accumulator = 0;
    lastFrame = performance.now();
    needsRender = true;

    ui.startPause.textContent = running ? 'Pause' : 'Start';
    ui.startPause.classList.toggle('is-running', running);

    updateHint();
}

function reset() {
    setRunning(false);
    world.reset();
    chart.clear();
    renderer.cellsDirty = true;
    updateStats();
}

ui.startPause.addEventListener('click', () => setRunning(!running));
ui.reset.addEventListener('click', reset);

// ====== stats ==============================================================

function updateStats() {
    const coverage = world.filledPercentage;

    ui.coverage.innerHTML = `${coverage.toFixed(1)}<small>%</small>`;
    ui.iterations.textContent = world.iterations;
    ui.agents.textContent = world.agents.length;
    ui.leaders.textContent = world.leaderCount;
    ui.walls.textContent = world.grid.wallCount;

    chart.canvas.setAttribute(
        'aria-label',
        `Coverage over time. ${coverage.toFixed(1)} percent covered after ${world.iterations} iterations.`
    );
}

function updateHint() {
    ui.hint.innerHTML = running
        ? 'Running &mdash; <b>click or drag</b> on the world to drop a leak for the swarm to clean up.'
        : 'Paused &mdash; <b>drag</b> on the world to paint walls, or drag starting on a wall to erase.';
}

// ====== the loop ===========================================================

function frame(now) {
    requestAnimationFrame(frame);

    const delta = now - lastFrame;
    lastFrame = now;

    if (running) {
        const stepMs = 1000 / world.params.fps;
        accumulator = Math.min(accumulator + delta, stepMs * MAX_STEPS_PER_FRAME);

        let steps = 0;

        while (accumulator >= stepMs && steps < MAX_STEPS_PER_FRAME) {
            world.step();
            chart.push(world.iterations, world.filledPercentage);
            accumulator -= stepMs;
            steps++;
        }

        if (steps > 0) {
            renderer.cellsDirty = true;
            updateStats();
            chart.draw();
        }
    }

    if (running || needsRender) {
        renderer.render();
        needsRender = false;
    }
}

// ====== painting walls and leaks ===========================================

/** Applies the current tool to the brush-sized block of cells around (x, y). */
function applyBrush(x, y) {
    if (painting === 'leak') {
        world.addLeakAt(x, y);
        return;
    }

    const half = Math.floor(Number(ui.brush.value) / 2);
    const add = painting === 'wall';

    for (let ox = -half; ox <= half; ox++) {
        for (let oy = -half; oy <= half; oy++) {
            world.setWallAt(x + ox * CELL_SIZE, y + oy * CELL_SIZE, add);
        }
    }
}

/** Fills in the gap between two pointer events so a fast drag stays continuous. */
function strokeTo(x, y) {
    if (lastPaintPoint) {
        const span = distance(lastPaintPoint.x, lastPaintPoint.y, x, y);
        const steps = Math.ceil(span / (CELL_SIZE / 2));

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            applyBrush(
                lastPaintPoint.x + (x - lastPaintPoint.x) * t,
                lastPaintPoint.y + (y - lastPaintPoint.y) * t
            );
        }
    }

    applyBrush(x, y);

    lastPaintPoint = { x, y };
    renderer.cellsDirty = true;
    needsRender = true;
    updateStats();
}

ui.canvas.addEventListener('pointerdown', (event) => {
    const point = renderer.toWorld(event.clientX, event.clientY);

    ui.canvas.setPointerCapture(event.pointerId);

    // The tool is decided on press and held for the whole stroke, so dragging
    // across mixed ground does not flip between painting and erasing.
    painting = running ? 'leak' : (world.isWallAt(point.x, point.y) ? 'erase' : 'wall');
    lastPaintPoint = null;

    strokeTo(point.x, point.y);
});

ui.canvas.addEventListener('pointermove', (event) => {
    if (!painting) return;

    const point = renderer.toWorld(event.clientX, event.clientY);
    strokeTo(point.x, point.y);
});

// The canvas captures the pointer on press, so the release always lands here
// even if the drag wandered off the element.
for (const type of ['pointerup', 'pointercancel']) {
    ui.canvas.addEventListener(type, () => {
        painting = null;
        lastPaintPoint = null;
    });
}

// ====== maps ===============================================================

function rebuildWorldSelect(selectValue) {
    const previous = selectValue !== undefined ? selectValue : ui.worldSelect.value;
    const saved = WorldStore.list();

    ui.worldSelect.textContent = '';

    const presets = document.createElement('optgroup');
    presets.label = 'Presets';

    for (const preset of WALL_PRESETS) {
        const option = document.createElement('option');
        option.value = `preset:${preset.id}`;
        option.textContent = preset.name;
        presets.append(option);
    }

    ui.worldSelect.append(presets);

    if (saved.length > 0) {
        const group = document.createElement('optgroup');
        group.label = 'Saved';

        for (const stored of saved) {
            const option = document.createElement('option');
            option.value = `saved:${stored.name}`;
            option.textContent = stored.name;
            group.append(option);
        }

        ui.worldSelect.append(group);
    }

    ui.worldSelect.value = previous;

    if (!ui.worldSelect.value) ui.worldSelect.value = 'preset:empty';

    ui.deleteWorld.disabled = !ui.worldSelect.value.startsWith('saved:');
}

function wallsForSelection(value) {
    const { cols, rows } = world.grid;

    if (value.startsWith('preset:')) {
        const preset = WALL_PRESETS.find((entry) => entry.id === value.slice(7));
        return preset ? preset.build(cols, rows) : [];
    }

    const stored = WorldStore.list().find((entry) => entry.name === value.slice(6));

    return stored ? WorldStore.wallsOf(stored, cols, rows) : [];
}

function loadSelectedWorld() {
    world.loadWalls(wallsForSelection(ui.worldSelect.value));
    ui.deleteWorld.disabled = !ui.worldSelect.value.startsWith('saved:');
    reset();
}

ui.worldSelect.addEventListener('change', loadSelectedWorld);

ui.clearWalls.addEventListener('click', () => {
    ui.worldSelect.value = 'preset:empty';
    loadSelectedWorld();
});

ui.saveWorld.addEventListener('click', () => {
    if (!WorldStore.available()) {
        window.alert('This browser will not let the page store saved worlds.');
        return;
    }

    const suggestion = ui.worldSelect.value.startsWith('saved:')
        ? ui.worldSelect.value.slice(6)
        : '';
    const name = (window.prompt('Save this map as:', suggestion) || '').trim();

    if (!name) return;

    const exists = WorldStore.list().some((entry) => entry.name === name);

    if (exists && !window.confirm(`Replace the saved world "${name}"?`)) return;

    WorldStore.save(name, world.grid.cols, world.grid.rows, world.grid.wallIndices());
    rebuildWorldSelect(`saved:${name}`);
});

ui.deleteWorld.addEventListener('click', () => {
    const name = ui.worldSelect.value.slice(6);

    if (!ui.worldSelect.value.startsWith('saved:')) return;
    if (!window.confirm(`Delete the saved world "${name}"?`)) return;

    WorldStore.remove(name);
    rebuildWorldSelect('preset:empty');
});

// ====== display and export =================================================

ui.grid.addEventListener('change', () => {
    renderer.showGrid = ui.grid.checked;
    needsRender = true;
});

ui.theme.addEventListener('change', () => {
    renderer.setTheme(ui.theme.value);
    needsRender = true;
});

ui.csv.addEventListener('click', () => {
    const blob = new Blob([chart.toCsv()], { type: 'text/csv' });
    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);
    link.download = `swarm-coverage-${world.iterations}-iterations.csv`;
    link.click();

    URL.revokeObjectURL(link.href);
});

// ====== keyboard ===========================================================

document.addEventListener('keydown', (event) => {
    const target = event.target;

    if (target instanceof HTMLInputElement
        || target instanceof HTMLSelectElement
        || target instanceof HTMLButtonElement) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.code === 'Space') {
        event.preventDefault();
        setRunning(!running);
    } else if (event.key === 'r' || event.key === 'R') {
        reset();
    } else if (event.key === 'g' || event.key === 'G') {
        ui.grid.checked = !ui.grid.checked;
        renderer.showGrid = ui.grid.checked;
        needsRender = true;
    }
});

// ====== resize =============================================================

const observer = new ResizeObserver(() => {
    renderer.resize();
    chart.resize();
    needsRender = true;
});

observer.observe(ui.canvas);
observer.observe(chart.canvas);

// ====== go =================================================================

renderer.showGrid = ui.grid.checked;
renderer.setTheme(ui.theme.value);
rebuildWorldSelect('preset:empty');
reset();
requestAnimationFrame(frame);
