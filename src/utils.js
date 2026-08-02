'use strict';

/* Geometry and random helpers. Direct port of Utils.java, minus the JavaFX
 * node builders (the web version draws to a canvas instead of a scene graph). */

function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, low, high) {
    return value < low ? low : (value > high ? high : value);
}

/** Integer in [low, high). Mirrors Java's `new Random().nextInt(high-low) + low`,
 * which throws when the range is empty; here it just returns `low`. */
function randomBetween(low, high) {
    if (high <= low) return low;
    return Math.floor(Math.random() * (high - low)) + low;
}

/** A point `stepSize` away from p1 along the p1->p2 line.
 * `getAway` walks in the opposite direction instead.
 * Java returned NaN when the two points coincide; here the point stays put. */
function newPointInLine(p1, p2, stepSize, getAway) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const mag = Math.sqrt(dx * dx + dy * dy);

    if (mag === 0) return { x: p1.x, y: p1.y };

    const k = stepSize / mag;
    return getAway
        ? { x: p1.x - dx * k, y: p1.y - dy * k }
        : { x: p1.x + dx * k, y: p1.y + dy * k };
}

/** Rotate p1 by a fixed 0.1 rad around `center`, keeping its distance to it.
 * (Java took a stepSize argument here but never used it.) */
function newPointInPerimeter(p1, center) {
    const radius = distance(p1.x, p1.y, center.x, center.y);
    let t = Math.atan2(p1.y - center.y, p1.x - center.x);

    if (t < 0) t += Math.PI * 2;
    t += 0.1;

    return {
        x: center.x + radius * Math.cos(t),
        y: center.y + radius * Math.sin(t)
    };
}

/** A random point up to `stepSize` away on each axis, independently signed. */
function randomPosFrom(p, stepSize) {
    const reach = Math.floor(stepSize);

    return {
        x: Math.random() < 0.5 ? p.x + randomBetween(0, reach) : p.x - randomBetween(0, reach),
        y: Math.random() < 0.5 ? p.y + randomBetween(0, reach) : p.y - randomBetween(0, reach)
    };
}

/** Small seeded PRNG, so the generated wall presets look the same every time. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
