'use strict';

/* Hover and focus descriptions for anything carrying a `data-tip` attribute.
 *
 * The bubble is appended to <body> rather than nested beside its trigger: the
 * control panel is a scrolling container that clips its own overflow, so a
 * nested tooltip would be sliced off at the panel edge. Positioning is
 * therefore in viewport coordinates. */

const TOOLTIP_GAP = 10;
const TOOLTIP_MARGIN = 8;

class Tooltips {
    constructor() {
        this.bubble = document.createElement('div');
        this.bubble.className = 'tooltip';
        this.bubble.id = 'control-tooltip';
        this.bubble.setAttribute('role', 'tooltip');
        this.bubble.hidden = true;
        document.body.append(this.bubble);

        this.target = null;

        document.addEventListener('pointerover', (event) => this.onEnter(event));
        document.addEventListener('pointerout', (event) => this.onLeave(event));
        // Dragging a slider should not leave the bubble sitting over the panel.
        document.addEventListener('pointerdown', () => this.hide());
        document.addEventListener('focusin', (event) => this.onEnter(event));
        document.addEventListener('focusout', () => this.hide());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.hide();
        });
        window.addEventListener('resize', () => this.hide());
        // Capturing, so it also catches the control panel scrolling.
        window.addEventListener('scroll', () => this.hide(), true);
    }

    onEnter(event) {
        if (!(event.target instanceof Element)) return;

        const trigger = event.target.closest('[data-tip]');

        if (!trigger || trigger === this.target) return;

        this.show(trigger);
    }

    onLeave(event) {
        if (!this.target) return;

        // Moving between children of the same trigger is not a leave.
        const to = event.relatedTarget;

        if (to instanceof Node && this.target.contains(to)) return;

        this.hide();
    }

    show(trigger) {
        this.hide();

        this.target = trigger;
        this.bubble.textContent = trigger.dataset.tip;
        this.bubble.hidden = false;
        trigger.setAttribute('aria-describedby', this.bubble.id);

        this.place(trigger);
    }

    hide() {
        if (this.target) this.target.removeAttribute('aria-describedby');

        this.target = null;
        this.bubble.hidden = true;
    }

    /** Beside the trigger, on whichever side has room, clamped to the viewport. */
    place(trigger) {
        // Park it at the origin first so its measured width is its natural
        // width, not one squeezed by wherever it was last shown.
        this.bubble.style.left = '0px';
        this.bubble.style.top = '0px';

        const anchor = trigger.getBoundingClientRect();
        const tip = this.bubble.getBoundingClientRect();
        const roomRight = window.innerWidth - anchor.right;

        const left = roomRight > tip.width + TOOLTIP_GAP
            ? anchor.right + TOOLTIP_GAP
            : anchor.left - tip.width - TOOLTIP_GAP;

        const top = anchor.top + (anchor.height - tip.height) / 2;

        this.bubble.style.left =
            `${Math.round(clamp(left, TOOLTIP_MARGIN, window.innerWidth - tip.width - TOOLTIP_MARGIN))}px`;
        this.bubble.style.top =
            `${Math.round(clamp(top, TOOLTIP_MARGIN, window.innerHeight - tip.height - TOOLTIP_MARGIN))}px`;
    }
}
