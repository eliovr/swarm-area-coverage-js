'use strict';

/* The world's cell matrix. Port of GridCell.java, but stored as flat typed
 * arrays instead of one object (and one scene-graph Rectangle) per cell:
 * an 800x800 world holds 25600 cells that all tick every iteration. */

const CELL_SIZE = 5;
/* Java wrote `double radious = CELL_SIZE/2` with CELL_SIZE declared as an int,
 * so this was silently 2 instead of 2.5 and cell bounds were undersized. */
const CELL_RADIUS = CELL_SIZE / 2;

const BLANK = 0;
const PHEROMONE = 1;
const WALL = 2;
const LEAK = 3;

/** Pheromone trails never fade past this alpha, so a covered area stays legible. */
const MIN_OPACITY = 0.2;

class Grid {
    constructor(width, height) {
        this.cols = Math.floor(width / CELL_SIZE);
        this.rows = Math.floor(height / CELL_SIZE);
        this.length = this.cols * this.rows;

        this.state = new Uint8Array(this.length);
        this.amount = new Float32Array(this.length);
        this.visited = new Uint8Array(this.length);

        this.wallCount = 0;
        this.visitedCount = 0;
    }

    /** Clears everything, optionally keeping the walls that are already painted. */
    reset(keepWalls) {
        for (let i = 0; i < this.length; i++) {
            if (keepWalls && this.state[i] === WALL) {
                this.amount[i] = 0;
                this.visited[i] = 0;
                continue;
            }
            this.state[i] = BLANK;
            this.amount[i] = 0;
            this.visited[i] = 0;
        }

        this.visitedCount = 0;
        if (!keepWalls) this.wallCount = 0;
    }

    indexAt(x, y) {
        const cx = Math.floor(x / CELL_SIZE);
        const cy = Math.floor(y / CELL_SIZE);

        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -1;

        return cy * this.cols + cx;
    }

    centerX(index) {
        return (index % this.cols) * CELL_SIZE + CELL_RADIUS;
    }

    centerY(index) {
        return Math.floor(index / this.cols) * CELL_SIZE + CELL_RADIUS;
    }

    /** Indices of every cell whose bounds overlap the circle (x, y, radius).
     * Java derived the scan box from a truncated, pre-clamped corner, which
     * could clip a column off the left/top edge; this walks the real box. */
    cellsInArea(x, y, radius) {
        const reach = radius + CELL_RADIUS;
        const minX = Math.max(0, Math.floor((x - reach) / CELL_SIZE));
        const maxX = Math.min(this.cols - 1, Math.floor((x + reach) / CELL_SIZE));
        const minY = Math.max(0, Math.floor((y - reach) / CELL_SIZE));
        const maxY = Math.min(this.rows - 1, Math.floor((y + reach) / CELL_SIZE));
        const reachSq = reach * reach;
        const found = [];

        for (let cx = minX; cx <= maxX; cx++) {
            const dx = (cx * CELL_SIZE + CELL_RADIUS) - x;
            const dxSq = dx * dx;

            for (let cy = minY; cy <= maxY; cy++) {
                const dy = (cy * CELL_SIZE + CELL_RADIUS) - y;

                if (dxSq + dy * dy < reachSq) found.push(cy * this.cols + cx);
            }
        }

        return found;
    }

    setState(index, state) {
        const previous = this.state[index];

        if (state === previous) {
            if (state === BLANK) this.amount[index] = 0;
            return;
        }

        if (state === WALL) {
            this.wallCount++;
            // A cell turned into a wall leaves the denominator of the coverage
            // ratio, so it must not stay counted as visited.
            if (this.visited[index]) {
                this.visited[index] = 0;
                this.visitedCount--;
            }
        } else if (previous === WALL) {
            this.wallCount--;
        }

        this.state[index] = state;

        if (state === BLANK) this.amount[index] = 0;
    }

    markVisited(index) {
        if (this.visited[index]) return;

        this.visited[index] = 1;
        this.visitedCount++;
    }

    /** How full the cell is, on a 0..1 scale, whatever it holds. */
    amountPercentage(index) {
        const amount = this.amount[index];
        return amount < 1 ? amount : 1;
    }

    /** Subtract from what the cell holds. If the "cleaning product" outweighs the
     * contamination, what is left over is pheromone. */
    cleanAmount(index, amount) {
        this.amount[index] -= amount;

        if (this.amount[index] < 0) {
            this.setState(index, PHEROMONE);
            this.amount[index] = Math.abs(this.amount[index]);
        }
    }

    isWall(index) {
        return this.state[index] === WALL;
    }

    /** Alpha the cell is drawn with — the only place the old `setOpacity` calls survive. */
    opacity(index) {
        switch (this.state[index]) {
            case WALL:
                return 1;
            case PHEROMONE: {
                const amount = this.amount[index];
                return amount <= 0 ? 0 : Math.max(MIN_OPACITY, Math.min(1, amount));
            }
            case LEAK:
                return clamp(this.amount[index], 0, 1);
            default:
                return 0;
        }
    }

    /** Indices of every wall, for saving a world. */
    wallIndices() {
        const walls = [];

        for (let i = 0; i < this.length; i++) {
            if (this.state[i] === WALL) walls.push(i);
        }

        return walls;
    }
}
