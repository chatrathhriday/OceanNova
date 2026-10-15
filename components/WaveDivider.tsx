"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";

const WAVE_A =
  "M0 48 C120 78 240 84 360 60 C480 36 600 12 720 28 C840 44 960 80 1080 72 C1200 64 1320 30 1440 40 L1440 96 L0 96 Z M1440 48 C1560 78 1680 84 1800 60 C1920 36 2040 12 2160 28 C2280 44 2400 80 2520 72 C2640 64 2760 30 2880 40 L2880 96 L1440 96 Z";

const WAVE_B =
  "M0 64 C160 34 320 26 480 44 C640 62 800 86 960 74 C1120 62 1280 34 1440 50 L1440 96 L0 96 Z M1440 64 C1600 34 1760 26 1920 44 C2080 62 2240 86 2400 74 C2560 62 2720 34 2880 50 L2880 96 L0 96 Z";

const CREST = "M0 52 C160 26 320 20 480 40 C640 60 800 84 960 70 C1120 56 1280 28 1440 44";

/**
 * Animated wave section divider with scroll interaction:
 *  - the two wave layers parallax horizontally in opposite directions
 *  - the whole band lifts and stretches as it crosses the viewport
 *  - a bioluminescent crest line draws itself along the scroll range
 */
export function WaveDivider({
  flip = false,
  topColor = "#0A1628",
  bottomColor = "#0D2137",
  className = "",
}: {
  flip?: boolean;
  topColor?: string;
  bottomColor?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    mass: 0.4,
  });

  // opposing horizontal drift for depth
  const xBack = useTransform(smooth, [0, 1], ["-6%", "4%"]);
  const xFront = useTransform(smooth, [0, 1], ["5%", "-7%"]);
  // subtle swell as the divider passes through the viewport
  const scaleY = useTransform(smooth, [0, 0.5, 1], [0.82, 1.18, 0.82]);
  const crestLen = useTransform(smooth, [0.05, 0.65], [0, 1]);
  const crestOpacity = useTransform(smooth, [0, 0.15, 0.75, 1], [0, 0.9, 0.9, 0]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`relative h-16 w-full overflow-hidden md:h-24 ${className}`}
      style={{ background: topColor, transform: flip ? "scaleY(-1)" : undefined }}
    >
      <motion.div
        className="absolute inset-0 origin-bottom"
        style={{ x: xBack, scaleY }}
      >
        <svg
          className="absolute bottom-0 left-0 h-full w-[200%] animate-wave-x-slow"
          viewBox="0 0 1440 96"
          preserveAspectRatio="none"
        >
          <path d={WAVE_A} fill={bottomColor} opacity="0.45" />
        </svg>
      </motion.div>

      <motion.div
        className="absolute inset-0 origin-bottom"
        style={{ x: xFront, scaleY }}
      >
        <svg
          className="absolute bottom-0 left-0 h-full w-[200%] animate-wave-x"
          viewBox="0 0 1440 96"
          preserveAspectRatio="none"
        >
          <path d={WAVE_B} fill={bottomColor} />
        </svg>
      </motion.div>

      {/* crest line that draws with scroll */}
      <motion.svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 96"
        preserveAspectRatio="none"
        style={{ opacity: crestOpacity }}
      >
        <defs>
          <linearGradient id="crestGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00F5D4" stopOpacity="0" />
            <stop offset="35%" stopColor="#00F5D4" />
            <stop offset="70%" stopColor="#00BBF9" />
            <stop offset="100%" stopColor="#7B61FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={CREST}
          fill="none"
          stroke="url(#crestGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ pathLength: crestLen, filter: "drop-shadow(0 0 5px rgba(0,245,212,0.7))" }}
        />
      </motion.svg>
    </div>
  );
}
