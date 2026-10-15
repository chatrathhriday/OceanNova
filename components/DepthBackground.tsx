"use client";

import { motion, useScroll, useTransform } from "framer-motion";

/**
 * Scroll-driven "descent into the abyss" background.
 * Cross-fades three ocean gradients as the user travels down the page:
 * surface navy -> deep trench -> near-black abyss, with a deepening vignette.
 */
export function DepthBackground() {
  const { scrollYProgress } = useScroll();

  const surface = useTransform(scrollYProgress, [0, 0.2, 0.34], [1, 0.55, 0]);
  const trench = useTransform(scrollYProgress, [0.1, 0.3, 0.58, 0.74], [0, 1, 1, 0]);
  const abyss = useTransform(scrollYProgress, [0.56, 0.8], [0, 1]);
  const vignette = useTransform(scrollYProgress, [0, 1], [0.25, 0.85]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* L1 — surface waters */}
      <motion.div
        style={{ opacity: surface }}
        className="absolute inset-0 bg-[linear-gradient(180deg,#0A1628_0%,#0D2137_55%,#132E4A_100%)]"
      />
      {/* L2 — the trench */}
      <motion.div
        style={{ opacity: trench }}
        className="absolute inset-0 bg-[linear-gradient(180deg,#081120_0%,#0C1C30_50%,#0E2138_100%)]"
      />
      {/* L3 — abyssal plain (flows into footer #060D1A) */}
      <motion.div
        style={{ opacity: abyss }}
        className="absolute inset-0 bg-[linear-gradient(180deg,#02060C_0%,#040A14_55%,#060D1A_100%)]"
      />
      {/* pressure vignette deepens with scroll */}
      <motion.div
        style={{ opacity: vignette }}
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(1,3,7,0.85)_100%)]"
      />
    </div>
  );
}
