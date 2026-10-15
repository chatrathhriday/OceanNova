"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";

/**
 * Wave-shaped scroll progress bar pinned to the top of the viewport.
 * The fill is a live animated wave crest, and a glowing "tide head"
 * rides the leading edge as you scroll.
 */
export function ScrollWaveIndicator() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 28,
    mass: 0.3,
  });
  const width = useTransform(progress, (v) => `${v * 100}%`);
  const left = useTransform(progress, (v) => `${v * 100}%`);
  const opacity = useTransform(scrollYProgress, [0, 0.012, 0.99, 1], [0, 1, 1, 0.4]);

  return (
    <motion.div
      aria-hidden
      style={{ opacity }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[130] h-[6px]"
    >
      {/* filled tide */}
      <motion.div style={{ width }} className="relative h-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-plankton/70 via-electric-teal to-bio-cyan" />
        {/* animated crest riding the fill */}
        <svg
          className="absolute inset-x-0 -top-1 h-3 w-[200%] animate-wave-x opacity-80"
          viewBox="0 0 240 12"
          preserveAspectRatio="none"
        >
          <path
            d="M0 7 Q 7.5 2 15 7 T 30 7 T 45 7 T 60 7 T 75 7 T 90 7 T 105 7 T 120 7 T 135 7 T 150 7 T 165 7 T 180 7 T 195 7 T 210 7 T 225 7 T 240 7"
            fill="none"
            stroke="rgba(240,247,255,0.75)"
            strokeWidth="1.2"
          />
        </svg>
      </motion.div>

      {/* glowing tide head */}
      <motion.span
        style={{ left }}
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bio-cyan shadow-[0_0_14px_rgba(0,245,212,0.95),0_0_28px_rgba(0,187,249,0.6)]"
      />
      <motion.span
        style={{ left }}
        className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-bio-cyan/50 animate-ripple-ring"
      />
    </motion.div>
  );
}
