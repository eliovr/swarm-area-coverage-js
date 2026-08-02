'use strict';

/* Saving and loading hand-painted worlds — the feature that sat commented out
 * in SwarmWorld.java, backed by localStorage instead of a `worlds.txt`.
 *
 * Walls are stored run-length encoded: a list of alternating run lengths
 * starting with a run of empty cells. A typical map costs a few hundred bytes
 * instead of the ~50KB a raw index list would take. */

const WORLD_STORE_KEY = 'swarm-area-coverage.worlds';

function encodeWalls(walls, length) {
    const isWall = new Uint8Array(length);

    for (const i of walls) {
        if (i >= 0 && i < length) isWall[i] = 1;
    }

    const runs = [];
    let current = 0;
    let run = 0;

    for (let i = 0; i < length; i++) {
        if (isWall[i] === current) {
            run++;
        } else {
            runs.push(run);
            current = isWall[i];
            run = 1;
        }
    }

    runs.push(run);

    return runs;
}

function decodeWalls(runs) {
    const walls = [];
    let index = 0;
    let isWall = false;

    for (const run of runs) {
        if (isWall) {
            for (let i = 0; i < run; i++) walls.push(index + i);
        }

        index += run;
        isWall = !isWall;
    }

    return walls;
}

const WorldStore = {
    available() {
        try {
            const probe = `${WORLD_STORE_KEY}.probe`;
            localStorage.setItem(probe, '1');
            localStorage.removeItem(probe);
            return true;
        } catch (err) {
            return false;
        }
    },

    /** @returns {Array<{name: string, cols: number, rows: number, runs: number[]}>} */
    list() {
        try {
            const raw = localStorage.getItem(WORLD_STORE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn('Could not read saved worlds', err);
            return [];
        }
    },

    /** Saves under `name`, replacing any world already stored under it. */
    save(name, cols, rows, walls) {
        const worlds = this.list().filter((world) => world.name !== name);

        worlds.push({ name, cols, rows, runs: encodeWalls(walls, cols * rows) });
        worlds.sort((a, b) => a.name.localeCompare(b.name));

        localStorage.setItem(WORLD_STORE_KEY, JSON.stringify(worlds));

        return worlds;
    },

    remove(name) {
        const worlds = this.list().filter((world) => world.name !== name);

        localStorage.setItem(WORLD_STORE_KEY, JSON.stringify(worlds));

        return worlds;
    },

    /** Wall indices for a stored world, rescaled if it was saved on a different
     * grid — worlds saved before the world was widened, for instance.
     *
     * Every destination cell samples the source, rather than every source cell
     * being projected forward: projecting forward skips destination cells when
     * scaling up, which punches holes through stretched walls. */
    wallsOf(world, cols, rows) {
        const walls = decodeWalls(world.runs || []);

        if (!world.cols || !world.rows) return [];
        if (world.cols === cols && world.rows === rows) return walls;

        const source = new Uint8Array(world.cols * world.rows);

        for (const i of walls) {
            if (i >= 0 && i < source.length) source[i] = 1;
        }

        const rescaled = [];

        for (let cy = 0; cy < rows; cy++) {
            const sy = Math.min(world.rows - 1, Math.floor((cy * world.rows) / rows));

            for (let cx = 0; cx < cols; cx++) {
                const sx = Math.min(world.cols - 1, Math.floor((cx * world.cols) / cols));

                if (source[sy * world.cols + sx]) rescaled.push(cy * cols + cx);
            }
        }

        return rescaled;
    }
};
