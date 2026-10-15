"use client";

import { useCallback, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Ping = { id: number; x: number; y: number; reading: string };

const READINGS = [
  "Depth 1,842m · Temp 4.2°C · Clear",
  "Depth 612m · Chlorophyll nominal",
  "Salinity 34.7 PSU · No anomaly",
  "Depth 3,105m · Pressure 312 atm",
  "Surface temp 21.6°C · Calm",
  "Spectral scan clean · 0 flags",
  "pH 8.1 · Dissolved O2 nominal",
  "Current 0.4kn NE · Stable",
];

let counter = 0;

/** Click anywhere in the hero to send out a sonar pulse and fish up a live-sounding reading. */
export function SonarPing() {
  const [pings, setPings] = useState<Ping[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const spawn = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const id = ++counter;
    const reading = READINGS[Math.floor(Math.random() * READINGS.length)];
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPings((p) => [...p.slice(-2), { id, x, y, reading }]);
    setTimeout(() => setPings((p) => p.filter((pp) => pp.id !== id)), 1900);
  }, []);

  return (
    <div
      ref={ref}
      onClick={spawn}
      data-cursor="hover"
      aria-hidden
      className="absolute inset-0 z-[5] cursor-crosshair"
    >
      <AnimatePresence>
        {pings.map((p) => (
          <span key={p.id} className="pointer-events-none absolute" style={{ left: p.x, top: p.y }}>
            <motion.span
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-bio-cyan/70"
              initial={{ width: 0, height: 0, opacity: 0.9 }}
              animate={{ width: 150, height: 150, opacity: 0 }}
              transition={{ duration: 1.3, ease: "easeOut" }}
            />
            <motion.span
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-electric-teal/50"
              initial={{ width: 0, height: 0, opacity: 0.8 }}
              animate={{ width: 72, height: 72, opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
            />
            <motion.span
              className="absolute left-0 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bio-cyan"
              style={{ boxShadow: "0 0 10px rgba(0,245,212,0.9)" }}
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.6, 1] }}
              transition={{ duration: 0.4 }}
            />
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: -16, scale: 1 }}
              exit={{ opacity: 0, y: -26 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-full border border-bio-cyan/30 bg-abyssal-navy/85 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-bio-cyan backdrop-blur-sm"
            >
              {p.reading}
            </motion.div>
          </span>
        ))}
      </AnimatePresence>
    </div>
  );
}
