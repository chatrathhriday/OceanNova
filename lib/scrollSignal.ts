/**
 * Shared, singleton scroll signal.
 * One rAF loop feeds every wave canvas on the page with smoothed
 * scroll position, velocity and page progress — so waves can surge,
 * shear and drift as the user scrolls without each component
 * attaching its own listeners.
 */
export type ScrollSignal = {
  y: number;
  /** smoothed px/frame delta, negative = scrolling up */
  velocity: number;
  /** 0..1 down the whole document */
  progress: number;
};

const state: ScrollSignal = { y: 0, velocity: 0, progress: 0 };

let started = false;

function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  let last = window.scrollY;

  const tick = () => {
    const y = window.scrollY;
    const delta = y - last;
    last = y;

    // smooth toward the instantaneous delta, then decay to rest
    state.velocity += (delta - state.velocity) * 0.25;
    state.velocity *= 0.9;
    if (Math.abs(state.velocity) < 0.01) state.velocity = 0;

    state.y = y;
    const max =
      document.documentElement.scrollHeight - window.innerHeight;
    state.progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

export function getScrollSignal(): ScrollSignal {
  start();
  return state;
}
