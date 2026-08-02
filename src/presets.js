'use strict';

/* Built-in wall layouts. The Java version read these from a `worlds.txt` that
 * was never shipped, so in practice it only ever offered "Empty".
 *
 * Every builder takes the grid dimensions in cells and returns a list of cell
 * indices to turn into walls. Corridors are kept wide enough (>= 10 cells, so
 * 50px) that even the largest agents can flock through them. */

class WallSet {
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        this.cells = new Set();
    }

    add(cx, cy) {
        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
        this.cells.add(cy * this.cols + cx);
    }

    remove(cx, cy) {
        this.cells.delete(cy * this.cols + cx);
    }

    rect(x, y, width, height) {
        for (let cx = x; cx < x + width; cx++) {
            for (let cy = y; cy < y + height; cy++) this.add(cx, cy);
        }
    }

    clearRect(x, y, width, height) {
        for (let cx = x; cx < x + width; cx++) {
            for (let cy = y; cy < y + height; cy++) this.remove(cx, cy);
        }
    }

    toArray() {
        return Array.from(this.cells);
    }
}

function buildRooms(cols, rows) {
    const walls = new WallSet(cols, rows);
    const thickness = 2;
    const midX = Math.floor(cols / 2) - 1;
    const midY = Math.floor(rows / 2) - 1;
    const door = Math.round(rows * 0.11);

    walls.rect(midX, 0, thickness, rows);
    walls.rect(0, midY, cols, thickness);

    // One doorway per wall segment, so the four rooms stay connected.
    walls.clearRect(midX, Math.round(rows * 0.22), thickness, door);
    walls.clearRect(midX, Math.round(rows * 0.67), thickness, door);
    walls.clearRect(Math.round(cols * 0.22), midY, door, thickness);
    walls.clearRect(Math.round(cols * 0.67), midY, door, thickness);

    return walls.toArray();
}

function buildPillars(cols, rows) {
    const walls = new WallSet(cols, rows);
    const block = Math.round(cols / 15);
    const pitch = block * 3;

    for (let cx = pitch; cx + block < cols; cx += pitch) {
        for (let cy = pitch; cy + block < rows; cy += pitch) {
            walls.rect(cx, cy, block, block);
        }
    }

    return walls.toArray();
}

function buildMaze(cols, rows) {
    const walls = new WallSet(cols, rows);
    const random = mulberry32(20131107);
    const minChamber = Math.round(cols / 8);
    const corridor = Math.max(6, Math.round(cols / 12));

    // Recursive division: split a chamber with a wall, punch one gap in it,
    // then divide each half, until the halves get too small to split again.
    const divide = (x, y, width, height) => {
        if (width < minChamber * 2 || height < minChamber * 2) return;

        const vertical = width > height;
        const span = vertical ? width : height;
        const at = minChamber + Math.floor(random() * (span - minChamber * 2));
        const gapAt = Math.floor(random() * ((vertical ? height : width) - corridor));

        if (vertical) {
            walls.rect(x + at, y, 2, height);
            walls.clearRect(x + at, y + gapAt, 2, corridor);
            divide(x, y, at, height);
            divide(x + at + 2, y, width - at - 2, height);
        } else {
            walls.rect(x, y + at, width, 2);
            walls.clearRect(x + gapAt, y + at, corridor, 2);
            divide(x, y, width, at);
            divide(x, y + at + 2, width, height - at - 2);
        }
    };

    divide(0, 0, cols, rows);

    return walls.toArray();
}

function buildSpiral(cols, rows) {
    const walls = new WallSet(cols, rows);
    const centreX = cols / 2;
    const centreY = rows / 2;
    const turns = 3;
    const maxRadius = Math.min(cols, rows) / 2 - 4;
    const steps = 4000;

    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * turns * Math.PI * 2;
        const radius = 6 + (t / (turns * Math.PI * 2)) * (maxRadius - 6);
        const cx = Math.round(centreX + radius * Math.cos(t));
        const cy = Math.round(centreY + radius * Math.sin(t));

        walls.add(cx, cy);
        walls.add(cx + 1, cy);
        walls.add(cx, cy + 1);
    }

    return walls.toArray();
}

const WALL_PRESETS = [
    { id: 'empty', name: 'Empty', build: () => [] },
    { id: 'rooms', name: 'Four rooms', build: buildRooms },
    { id: 'pillars', name: 'Pillars', build: buildPillars },
    { id: 'maze', name: 'Maze', build: buildMaze },
    { id: 'spiral', name: 'Spiral', build: buildSpiral }
];
