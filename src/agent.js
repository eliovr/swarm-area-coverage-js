'use strict';

/* Port of Agent.java. One member of the swarm.
 *
 * Each iteration an agent looks at every other agent and reacts to the closest
 * band it falls in: too close -> back off, comfortable -> orbit it, still in
 * flocking distance -> remember it if it is more confident than anyone seen so
 * far. It then follows the most confident agent it found, and recomputes its own
 * confidence from how much unmarked ground it is standing on. */

class Agent {
    constructor(size, world) {
        this.size = size;
        this.world = world;

        this.x = 0;
        this.y = 0;
        this.prev = null;

        this.confidence = 0;
        this.leading = true;

        this.personalRange = 0;
        this.comfortRange = 0;
        this.flockRange = 0;
        this.stepSize = 0;
        this.pheromone = 0;
        this.influence = 0;
        this.inertia = 0;
    }

    /* The three ranges nest: personal is measured from the agent's own body,
     * comfort extends personal, flock extends comfort. */

    get personalRadius() {
        return (this.size * 2) + this.personalRange;
    }

    get comfortRadius() {
        return this.personalRadius + this.comfortRange;
    }

    get flockRadius() {
        return this.comfortRadius + this.flockRange;
    }

    act() {
        const world = this.world;
        let next = { x: this.x, y: this.y };
        // Start by assuming I'm the most confident.
        let mostConfident = this;

        // Leave a trace where I am before moving somewhere else.
        world.dropPheromones(this.x, this.y, this.size, this.pheromone);

        for (const other of world.agents) {
            if (other === this) continue;

            // Only valid between agents: it assumes both bodies are the same size.
            const gap = distance(next.x, next.y, other.x, other.y);

            // If they're too close then...
            if (gap <= this.personalRadius) {
                // ...get away.
                next = newPointInLine(next, other, this.stepSize, true);
            }
            // If they're within a reasonable distance then...
            else if (gap <= this.comfortRadius) {
                // ...walk around it.
                next = newPointInPerimeter(next, other);
            }
            // If they're getting too far then...
            else if (gap <= this.flockRadius) {
                // ...check who's the most confident.
                if (other.confidence > mostConfident.confidence) mostConfident = other;
            }
        }

        // If there's someone more confident than I am then move towards it.
        if (mostConfident !== this) {
            next = newPointInLine(next, mostConfident, this.stepSize, false);
            this.leading = false;
        } else {
            this.leading = true;
        }

        // If nothing above moved me, wander.
        if (distance(next.x, next.y, this.x, this.y) <= 0) {
            next = randomPosFrom(this, this.stepSize);
        }

        next = this.applyInertia(next);

        if (world.isAllowed(next.x, next.y, this.size)) {
            this.moveTo(next);

            // Confidence is:
            //  1. how much of the area I cover is still free of pheromones,
            //  2. plus a share of the confidence of the agent I'm following,
            //  3. plus 10% just for having been able to move at all.
            this.confidence =
                (1 - world.pheromoneLevelAt(next.x, next.y, this.personalRadius)) +
                (mostConfident.confidence * this.influence) +
                0.1;
        } else {
            // Blocked: I lose all my confidence, and my heading with it.
            this.confidence = 0;
            this.prev = null;
        }
    }

    moveTo(pos) {
        this.prev = { x: this.x, y: this.y };
        this.x = pos.x;
        this.y = pos.y;
    }

    /** Blend where the agent wants to go with where it was already heading:
     * a share of its last displacement, carried forward, plus a share of a step
     * towards the position it is striving for. */
    applyInertia(next) {
        if (this.prev === null || this.inertia <= 0) return next;

        const carry = distance(this.x, this.y, this.prev.x, this.prev.y) * this.inertia;
        const heading = newPointInLine(this, this.prev, carry, true);

        return newPointInLine(heading, next, this.stepSize * (1 - this.inertia), false);
    }
}
