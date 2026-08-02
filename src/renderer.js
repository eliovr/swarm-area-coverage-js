'use strict';

/* Canvas renderer. The JavaFX original gave every cell its own Rectangle node
 * and let the scene graph do the compositing; 14400 DOM-ish nodes is not a good
 * idea on the web, so the cell layer is painted into an ImageData one pixel per
 * cell and blown up with smoothing off. */

const WORLD_THEMES = {
    light: {
        background: '#ffffff',
        grid: 'rgba(0, 0, 0, 0.2)',
        wall: [0, 0, 0],
        pheromone: [32, 178, 170],
        leak: [128, 128, 128],
        leader: '#e5484d',
        follower: '#11151c'
    },
    dark: {
        background: '#0d1117',
        grid: 'rgba(255, 255, 255, 0.12)',
        wall: [214, 221, 230],
        pheromone: [32, 178, 170],
        leak: [124, 133, 145],
        leader: '#ff6b6b',
        follower: '#e8edf5'
    }
};

class Renderer {
    constructor(canvas, world) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.world = world;
        this.theme = WORLD_THEMES.light;
        this.showGrid = true;
        this.cellsDirty = true;
        this.scale = 1;

        this.cellCanvas = document.createElement('canvas');
        this.cellCanvas.width = world.grid.cols;
        this.cellCanvas.height = world.grid.rows;
        this.cellCtx = this.cellCanvas.getContext('2d');
        this.cellImage = this.cellCtx.createImageData(world.grid.cols, world.grid.rows);

        this.gridPath = this.buildGridPath();

        this.resize();
    }

    setTheme(name) {
        this.theme = WORLD_THEMES[name] || WORLD_THEMES.light;
        this.cellsDirty = true;
    }

    buildGridPath() {
        const path = new Path2D();
        const { cols, rows } = this.world.grid;

        for (let i = 0; i <= rows; i++) {
            path.moveTo(0, i * CELL_SIZE);
            path.lineTo(this.world.width, i * CELL_SIZE);
        }

        for (let i = 0; i <= cols; i++) {
            path.moveTo(i * CELL_SIZE, 0);
            path.lineTo(i * CELL_SIZE, this.world.height);
        }

        return path;
    }

    /** Matches the backing store to the element's box, so the world always draws
     * in world units no matter how the layout sizes the canvas. The height comes
     * from the world's own proportions rather than from the box, which keeps the
     * canvas's intrinsic aspect ratio — and so its CSS `height: auto` — correct. */
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const ratio = window.devicePixelRatio || 1;
        const scale = (width * ratio) / this.world.width;

        this.canvas.width = Math.round(width * ratio);
        this.canvas.height = Math.round(this.world.height * scale);
        this.scale = scale;
        this.cellsDirty = true;
    }

    /** Turns a client-space point into world coordinates. */
    toWorld(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();

        return {
            x: (clientX - rect.left) * (this.world.width / rect.width),
            y: (clientY - rect.top) * (this.world.height / rect.height)
        };
    }

    paintCells() {
        const grid = this.world.grid;
        const data = this.cellImage.data;
        const theme = this.theme;

        for (let i = 0; i < grid.length; i++) {
            const alpha = grid.opacity(i);
            const offset = i * 4;

            if (alpha <= 0) {
                data[offset + 3] = 0;
                continue;
            }

            let colour;

            switch (grid.state[i]) {
                case WALL: colour = theme.wall; break;
                case LEAK: colour = theme.leak; break;
                default: colour = theme.pheromone; break;
            }

            data[offset] = colour[0];
            data[offset + 1] = colour[1];
            data[offset + 2] = colour[2];
            data[offset + 3] = Math.round(alpha * 255);
        }

        this.cellCtx.putImageData(this.cellImage, 0, 0);
        this.cellsDirty = false;
    }

    render() {
        const ctx = this.ctx;
        const world = this.world;

        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

        ctx.fillStyle = this.theme.background;
        ctx.fillRect(0, 0, world.width, world.height);

        if (this.showGrid) {
            ctx.strokeStyle = this.theme.grid;
            ctx.lineWidth = 0.5;
            ctx.stroke(this.gridPath);
        }

        if (this.cellsDirty) this.paintCells();

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.cellCanvas, 0, 0, world.width, world.height);

        ctx.globalAlpha = 0.7;

        for (const agent of world.agents) {
            ctx.fillStyle = agent.leading ? this.theme.leader : this.theme.follower;
            ctx.beginPath();
            ctx.arc(agent.x, agent.y, agent.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }
}
