'use strict';

/* Port of SwarmWorld.java. Holds the grid and the swarm, and drives one
 * iteration of the simulation. The JavaFX version pulled every parameter
 * through an abstract method implemented by the controller; here the UI writes
 * straight into `params`, which is read fresh on every iteration. */

const DEFAULT_PARAMS = {
    fps: 15,
    agents: 100,
    agentWidth: 3,
    personalRange: 15,
    comfortRange: 0,
    flockRange: 40,
    stepSize: 5,
    pheromone: 15,
    evaporation: 2,
    influence: 10,
    inertia: 0
};

class SwarmWorld {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = new Grid(width, height);
        this.agents = [];
        this.iterations = 0;
        this.params = Object.assign({}, DEFAULT_PARAMS);
    }

    /** Amount a single click of "leak" drops on a cell. It spreads from there. */
    static get LEAK_AMOUNT() {
        return 150;
    }

    /** How hard to try to find clear ground for an agent before giving up. */
    static get SPAWN_ATTEMPTS() {
        return 40;
    }

    /** Re-seeds the swarm and wipes pheromones, leaks and counters.
     * Walls are kept: they are the map, not the run. */
    reset() {
        this.grid.reset(true);
        this.iterations = 0;
        this.initAgents();
    }

    initAgents() {
        const count = Math.round(this.params.agents);
        const size = this.params.agentWidth;
        const midX = this.width / 2;
        const midY = this.height / 2;

        this.agents = [];

        for (let i = 0; i < count; i++) {
            const agent = new Agent(size, this);

            // Everyone starts bunched in the middle, as in the original. An
            // agent dropped inside a wall can never move again — every
            // candidate step is refused — so keep looking for clear ground,
            // and only settle for a blocked spot if the middle is walled in.
            for (let attempt = 0; attempt < SwarmWorld.SPAWN_ATTEMPTS; attempt++) {
                agent.x = randomBetween(midX - 100, midX + 100);
                agent.y = randomBetween(midY - 100, midY + 100);

                if (this.isAllowed(agent.x, agent.y, size)) break;
            }

            this.agents.push(agent);
        }
    }

    step() {
        this.updateCells();
        this.updateAgents();
        this.iterations++;
    }

    /** Every cell gets a turn: pheromones evaporate, leaks bleed into their
     * neighbours. Cells are updated in place and in column order, exactly as in
     * the original — a leak spreading can affect cells later in the same sweep. */
    updateCells() {
        const grid = this.grid;
        const evaporation = this.evaporationRate;

        for (let cx = 0; cx < grid.cols; cx++) {
            for (let cy = 0; cy < grid.rows; cy++) {
                const i = cy * grid.cols + cx;

                if (grid.state[i] === PHEROMONE) {
                    if (grid.visited[i] && grid.amount[i] > 0) {
                        grid.amount[i] = (1 - evaporation) * grid.amount[i];
                    }
                } else if (grid.state[i] === LEAK) {
                    const extra = grid.amount[i] - 1;

                    if (extra > 0) {
                        this.spread(i, extra);
                        grid.amount[i] = 1;
                    }
                }
            }
        }
    }

    updateAgents() {
        const params = this.params;

        for (const agent of this.agents) {
            agent.personalRange = params.personalRange;
            agent.comfortRange = params.comfortRange;
            agent.flockRange = params.flockRange;
            agent.stepSize = params.stepSize;
            agent.pheromone = params.pheromone / 100;
            agent.inertia = params.inertia / 100;
            agent.influence = params.influence / 100;

            agent.act();
        }
    }

    /** Share `amount` of leak from cell `core` over its free neighbours. */
    spread(core, amount) {
        const grid = this.grid;

        if (grid.state[core] !== LEAK) return;

        const neighbours = grid
            .cellsInArea(grid.centerX(core), grid.centerY(core), CELL_SIZE)
            .filter((i) => i !== core && !grid.isWall(i));

        if (neighbours.length === 0) return;

        const share = amount / neighbours.length;

        for (const i of neighbours) {
            if (grid.state[i] === LEAK) grid.amount[i] += share;
            else grid.amount[i] = share;

            grid.setState(i, LEAK);
        }
    }

    // ====== What an agent can do to, and perceive of, the world ============

    /** Lay down pheromone over the area the agent covers, cleaning any leak it
     * finds there. Every non-wall cell touched counts as covered. */
    dropPheromones(x, y, radius, pheromone) {
        const grid = this.grid;

        for (const i of grid.cellsInArea(x, y, radius)) {
            // A wall can never be covered; counting it would let the coverage
            // ratio climb past 100%.
            if (grid.isWall(i)) continue;

            grid.markVisited(i);

            if (grid.state[i] === LEAK) {
                grid.cleanAmount(i, pheromone);
            } else {
                if (grid.amountPercentage(i) <= 0) grid.setState(i, PHEROMONE);
                grid.amount[i] += pheromone;
            }
        }
    }

    /** Whether a body of `radius` centred on (x, y) may stand there. */
    isAllowed(x, y, radius) {
        return x - radius > 0
            && x + radius < this.width
            && y - radius > 0
            && y + radius < this.height
            && !this.collidesWithWall(x, y, radius);
    }

    collidesWithWall(x, y, radius) {
        const grid = this.grid;

        for (const i of grid.cellsInArea(x, y, radius)) {
            if (grid.isWall(i)) return true;
        }

        return false;
    }

    /** Mean pheromone density over the area — the share of it already marked.
     * Deliberately divided by every cell in the area, not just the marked ones:
     * that is what makes it a density, and what agent confidence is built on. */
    pheromoneLevelAt(x, y, radius) {
        const grid = this.grid;
        const cells = grid.cellsInArea(x, y, radius);

        if (cells.length === 0) return 0;

        let level = 0;

        for (const i of cells) {
            if (grid.state[i] === PHEROMONE) level += grid.amountPercentage(i);
        }

        return level / cells.length;
    }

    /** Mean leak density over the area. Unused by the confidence model as
     * shipped — the dissertation's cleaning variant reads it. */
    leakageLevelAt(x, y, radius) {
        const grid = this.grid;
        const cells = grid.cellsInArea(x, y, radius);

        if (cells.length === 0) return 0;

        let level = 0;

        for (const i of cells) {
            if (grid.state[i] === LEAK) level += grid.amountPercentage(i);
        }

        return level / cells.length;
    }

    get evaporationRate() {
        return this.params.evaporation / 100;
    }

    // ====== Editing the map ================================================

    setWallAt(x, y, add) {
        const i = this.grid.indexAt(x, y);

        if (i < 0) return;

        this.grid.setState(i, add ? WALL : BLANK);
    }

    isWallAt(x, y) {
        const i = this.grid.indexAt(x, y);
        return i >= 0 && this.grid.isWall(i);
    }

    addLeakAt(x, y) {
        const i = this.grid.indexAt(x, y);

        if (i < 0 || this.grid.isWall(i)) return;

        this.grid.setState(i, LEAK);
        this.grid.amount[i] = SwarmWorld.LEAK_AMOUNT;
    }

    /** Replaces the map. `walls` is a list of cell indices. */
    loadWalls(walls) {
        const grid = this.grid;

        for (let i = 0; i < grid.length; i++) {
            if (grid.isWall(i)) grid.setState(i, BLANK);
        }

        for (const i of walls) {
            if (i >= 0 && i < grid.length) grid.setState(i, WALL);
        }
    }

    /** Share of the reachable world that has been covered at least once. */
    get filledPercentage() {
        const reachable = this.grid.length - this.grid.wallCount;

        if (reachable <= 0) return 100;

        return Math.min(100, (this.grid.visitedCount * 100) / reachable);
    }

    get leaderCount() {
        let leaders = 0;

        for (const agent of this.agents) {
            if (agent.leading) leaders++;
        }

        return leaders;
    }
}
