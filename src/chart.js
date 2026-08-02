'use strict';

/* Live plot of coverage against iterations. One series, so no legend — the
 * heading names it — and the current value is carried as a hero number beside
 * the plot rather than as a label on every point. */

const CHART_MAX_POINTS = 900;

class CoverageChart {
    constructor(canvas, tooltip) {
        this.canvas = canvas;
        this.tooltip = tooltip;
        this.ctx = canvas.getContext('2d');

        // Samples are thinned as the run gets long: once the buffer is full,
        // every other point is dropped and the sampling stride doubles.
        this.iterations = [];
        this.values = [];
        this.stride = 1;
        this.hover = -1;

        this.style = {
            line: '#3987e5',
            fill: 'rgba(57, 135, 229, 0.20)',
            grid: 'rgba(255, 255, 255, 0.07)',
            axis: 'rgba(255, 255, 255, 0.14)',
            text: '#8b95a5',
            surface: '#161b22',
            crosshair: 'rgba(255, 255, 255, 0.28)'
        };

        this.padding = { top: 10, right: 12, bottom: 20, left: 34 };

        canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
        canvas.addEventListener('pointerleave', () => this.onPointerLeave());

        this.resize();
    }

    clear() {
        this.iterations.length = 0;
        this.values.length = 0;
        this.stride = 1;
        this.hover = -1;
        this.hideTooltip();
        this.draw();
    }

    push(iteration, value) {
        if (iteration % this.stride !== 0) return;

        this.iterations.push(iteration);
        this.values.push(value);

        if (this.iterations.length > CHART_MAX_POINTS) this.thin();
    }

    thin() {
        const iterations = [];
        const values = [];

        for (let i = 0; i < this.iterations.length; i += 2) {
            iterations.push(this.iterations[i]);
            values.push(this.values[i]);
        }

        this.iterations = iterations;
        this.values = values;
        this.stride *= 2;
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;

        this.width = Math.max(1, Math.round(rect.width));
        this.height = Math.max(1, Math.round(rect.height));
        this.canvas.width = Math.round(this.width * ratio);
        this.canvas.height = Math.round(this.height * ratio);
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        this.draw();
    }

    get plot() {
        const { top, right, bottom, left } = this.padding;

        return {
            x: left,
            y: top,
            width: Math.max(1, this.width - left - right),
            height: Math.max(1, this.height - top - bottom)
        };
    }

    xOf(index) {
        const plot = this.plot;
        const last = this.iterations[this.iterations.length - 1] || 1;

        return plot.x + (this.iterations[index] / last) * plot.width;
    }

    yOf(value) {
        const plot = this.plot;
        return plot.y + plot.height - (value / 100) * plot.height;
    }

    draw() {
        const ctx = this.ctx;
        const plot = this.plot;
        const style = this.style;

        ctx.clearRect(0, 0, this.width, this.height);

        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = style.text;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';

        // Recessive gridlines at 0 / 50 / 100%.
        for (const tick of [0, 50, 100]) {
            const y = this.yOf(tick);

            ctx.strokeStyle = tick === 0 ? style.axis : style.grid;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(plot.x, Math.round(y) + 0.5);
            ctx.lineTo(plot.x + plot.width, Math.round(y) + 0.5);
            ctx.stroke();

            ctx.fillText(`${tick}%`, plot.x - 6, y);
        }

        if (this.iterations.length < 2) {
            ctx.textAlign = 'center';
            // Kept off the 50% gridline so the two do not collide.
            ctx.fillText('waiting for the first iterations…', plot.x + plot.width / 2, plot.y + plot.height * 0.72);
            return;
        }

        const last = this.iterations[this.iterations.length - 1];

        ctx.textAlign = 'left';
        ctx.fillText('0', plot.x, plot.y + plot.height + 12);
        ctx.textAlign = 'right';
        ctx.fillText(`${last} iterations`, plot.x + plot.width, plot.y + plot.height + 12);

        const trace = new Path2D();

        for (let i = 0; i < this.iterations.length; i++) {
            const x = this.xOf(i);
            const y = this.yOf(this.values[i]);

            if (i === 0) trace.moveTo(x, y);
            else trace.lineTo(x, y);
        }

        const area = new Path2D(trace);
        area.lineTo(this.xOf(this.iterations.length - 1), this.yOf(0));
        area.lineTo(this.xOf(0), this.yOf(0));
        area.closePath();

        ctx.fillStyle = style.fill;
        ctx.fill(area);

        ctx.strokeStyle = style.line;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke(trace);

        if (this.hover >= 0 && this.hover < this.iterations.length) this.drawHover();
    }

    drawHover() {
        const ctx = this.ctx;
        const plot = this.plot;
        const x = this.xOf(this.hover);
        const y = this.yOf(this.values[this.hover]);

        ctx.strokeStyle = this.style.crosshair;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, plot.y);
        ctx.lineTo(Math.round(x) + 0.5, plot.y + plot.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2px surface ring so the marker reads over the line and fill.
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = this.style.surface;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = this.style.line;
        ctx.fill();
    }

    onPointerMove(event) {
        if (this.iterations.length < 2) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;

        let nearest = 0;
        let best = Infinity;

        for (let i = 0; i < this.iterations.length; i++) {
            const gap = Math.abs(this.xOf(i) - x);

            if (gap < best) {
                best = gap;
                nearest = i;
            }
        }

        this.hover = nearest;
        this.draw();
        this.showTooltip(nearest, rect);
    }

    onPointerLeave() {
        this.hover = -1;
        this.hideTooltip();
        this.draw();
    }

    showTooltip(index, rect) {
        if (!this.tooltip) return;

        const x = this.xOf(index);
        const y = this.yOf(this.values[index]);

        this.tooltip.hidden = false;
        this.tooltip.innerHTML =
            `<strong>${this.values[index].toFixed(1)}%</strong> covered` +
            `<span>iteration ${this.iterations[index]}</span>`;

        const width = this.tooltip.offsetWidth;
        const left = clamp(x - width / 2, 0, rect.width - width);

        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${Math.max(0, y - this.tooltip.offsetHeight - 10)}px`;
    }

    hideTooltip() {
        if (this.tooltip) this.tooltip.hidden = true;
    }

    toCsv() {
        const rows = ['iteration,coverage_percent'];

        for (let i = 0; i < this.iterations.length; i++) {
            rows.push(`${this.iterations[i]},${this.values[i].toFixed(3)}`);
        }

        return rows.join('\n');
    }
}
