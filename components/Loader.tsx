"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const LOGO = "OCEANNOVA";

export function Loader() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let p = 0;
    const started = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - started;
      // ease toward 92 while assets load, jump to 100 on window load
      const loaded = document.readyState === "complete";
      const target = loaded ? 100 : Math.min(92, 30 + elapsed / 55);
      p += (target - p) * 0.09;
      if (loaded && p > 98.5 && elapsed > 1500) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => setDone(true), 350);
      }
      setProgress(Math.round(p));
    }, 40);
    const onLoad = () => void 0;
    window.addEventListener("load", onLoad);
    return () => {
      clearInterval(interval);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-abyssal-navy"
          exit={{ opacity: 0, y: "-4%", filter: "blur(10px)" }}
          transition={{ duration: 0.8, ease: [0.7, 0, 0.2, 1] }}
        >
          {/* ambient glow */}
          <div className="absolute left-1/2 top-1/2 h-[46vmin] w-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bio-cyan/10 blur-[90px] animate-glow-pulse" />

          <div className="relative flex overflow-hidden">
            {LOGO.split("").map((ch, i) => (
              <motion.span
                key={i}
                initial={{ y: 90, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.7, ease: [0.2, 0.9, 0.2, 1] }}
                className="h-section bg-gradient-to-b from-foam to-bio-cyan bg-clip-text text-transparent"
              >
                {ch}
              </motion.span>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-3 font-mono text-[11px] uppercase tracking-[0.4em] text-electric-teal"
          >
            Initializing sonar array
          </motion.p>

          {/* progress bar with wave fill */}
          <div className="relative mt-8 h-1.5 w-56 overflow-hidden rounded-full bg-deep-ocean">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bio-cyan via-electric-teal to-plankton transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
            <svg
              className="absolute -top-2 left-0 h-3 w-[200%] animate-wave-x opacity-60"
              style={{ width: "200%" }}
              viewBox="0 0 120 6"
              preserveAspectRatio="none"
            >
              <path d="M0 3 Q 7.5 0 15 3 T 30 3 T 45 3 T 60 3 T 75 3 T 90 3 T 105 3 T 120 3" fill="none" stroke="#00f5d4" strokeWidth="0.8" />
            </svg>
          </div>
          <span className="mt-3 font-mono text-xs text-silver/70">{progress}%</span>

          {/* rising bubbles */}
          {[...Array(7)].map((_, i) => (
            <span
              key={i}
              className="absolute bottom-0 rounded-full border border-bio-cyan/40 bg-bio-cyan/10 animate-rise"
              style={{
                left: `${12 + i * 12}%`,
                width: `${5 + (i % 4) * 4}px`,
                height: `${5 + (i % 4) * 4}px`,
                animationDelay: `${i * 0.9}s`,
                animationDuration: `${6 + (i % 3) * 2.4}s`,
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
