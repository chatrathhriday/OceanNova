"use client";

import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Reveal } from "@/components/Reveal";

const STATS = [
  {
    label: "Buoys Online",
    value: 92,
    suffix: "%",
    color: "#00F5D4",
    detail: "148 of 161 registered buoys are reporting a heartbeat right now.",
  },
  {
    label: "Detection Accuracy",
    value: 97,
    suffix: "%",
    color: "#00BBF9",
    detail: "Validated against 4 years of labeled PACE anomaly events.",
  },
  {
    label: "Anomalies Tracked",
    value: 68,
    suffix: "%",
    color: "#7B61FF",
    detail: "Of flagged events, this share was successfully classified to a known cause.",
  },
  {
    label: "Response Time",
    value: 84,
    suffix: "%",
    color: "#FFC857",
    detail: "Percentage of anomalies explained within 4 hours of first detection.",
  },
];

type Ripple = { id: number; x: number; y: number };

function WaveGauge({
  value,
  color,
  delay,
  detail,
  active,
  onActivate,
}: {
  value: number;
  color: string;
  delay: number;
  detail: string;
  active: boolean;
  onActivate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);

  // 3D tilt that follows the cursor, spring-smoothed so it settles instead of snapping.
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const springX = useSpring(pointerX, { stiffness: 220, damping: 20 });
  const springY = useSpring(pointerY, { stiffness: 220, damping: 20 });
  const rotateX = useTransform(springY, [0, 1], [10, -10]);
  const rotateY = useTransform(springX, [0, 1], [-10, 10]);
  const glowX = useTransform(springX, [0, 1], ["10%", "90%"]);
  const glowY = useTransform(springY, [0, 1], ["10%", "90%"]);

  const handlePointerMove = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width);
    pointerY.set((event.clientY - rect.top) / rect.height);
  };
  const handlePointerLeave = () => {
    pointerX.set(0.5);
    pointerY.set(0.5);
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const id = rippleId.current++;
    setRipples((prev) => [
      ...prev,
      { id, x: event.clientX - rect.left, y: event.clientY - rect.top },
    ]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 700);
    onActivate();
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      data-cursor="hover"
      onClick={handleClick}
      onMouseEnter={onActivate}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      aria-expanded={active}
      aria-label={`${detail}`}
      className="group relative h-32 w-32 overflow-hidden rounded-full border border-white/10 bg-abyssal-navy/60 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:h-36 md:w-36"
      style={{ rotateX, rotateY, transformPerspective: 700 }}
      animate={{ scale: active ? 1.08 : 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {/* Idle ambient breathing glow so the gauges never sit fully static */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 3.2 + delay, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        style={{ boxShadow: `inset 0 0 20px ${color}44` }}
      />

      <motion.div
        className="absolute inset-x-0 bottom-0"
        initial={{ height: "0%" }}
        animate={inView ? { height: `${value}%` } : {}}
        transition={{ duration: 1.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ background: `linear-gradient(180deg, ${color}55, ${color}22)` }}
      >
        <svg className="absolute -top-3 left-0 w-[200%] animate-wave-x" viewBox="0 0 400 24" preserveAspectRatio="none">
          <path d="M0 12 C50 0 100 24 150 12 C200 0 250 24 300 12 C350 0 380 8 400 12 L400 24 L0 24 Z" fill={color} fillOpacity="0.55" />
        </svg>
        <svg className="absolute -top-1.5 left-0 w-[200%] animate-wave-x-slow opacity-70" viewBox="0 0 400 20" preserveAspectRatio="none">
          <path d="M0 10 C60 20 120 0 180 10 C240 20 300 0 360 10 L400 10 L400 20 L0 20 Z" fill={color} fillOpacity="0.4" />
        </svg>
      </motion.div>

      {/* Cursor-following highlight, revealed on hover */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(60px circle at ${glowX} ${glowY}, ${color}33, transparent 70%)`,
        }}
      />

      {/* Orbiting particle, only while this gauge is the active one */}
      {active && (
        <motion.span
          aria-hidden
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        >
          <motion.span
            className="absolute h-full w-full rounded-full"
            style={{ backgroundColor: color, translateX: 58, translateY: -0.5 }}
          />
        </motion.span>
      )}

      {/* Click ripple bursts */}
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          aria-hidden
          className="pointer-events-none absolute rounded-full border-2"
          style={{ left: r.x, top: r.y, borderColor: color, translateX: "-50%", translateY: "-50%" }}
          initial={{ width: 0, height: 0, opacity: 0.6 }}
          animate={{ width: 140, height: 140, opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      ))}

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1, scale: active ? 1.08 : 1 } : {}}
          transition={{ delay: delay + 0.4, duration: 0.6 }}
          className="font-display text-2xl font-bold text-foam md:text-3xl"
        >
          {value}%
        </motion.span>
      </div>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full ring-1 ring-inset transition-shadow duration-300"
        style={{
          boxShadow: active ? `inset 0 0 32px ${color}66, 0 0 24px -2px ${color}55` : `inset 0 0 24px ${color}33`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 rounded-full opacity-0 ring-2 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `0 0 0 0 ${color}`, borderColor: `${color}88` }}
      />
    </motion.button>
  );
}

export function StatsWave() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? STATS[activeIndex] : null;

  return (
    <section className="relative overflow-hidden py-20 md:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="relative mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <p className="mb-12 text-center font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan/80">
            The Fleet, By The Numbers
          </p>
        </Reveal>
        <div className="grid grid-cols-2 justify-center gap-8 sm:grid-cols-4 sm:gap-6">
          {STATS.map((s, i) => (
            <div key={s.label} className="flex flex-col items-center gap-4">
              <WaveGauge
                value={s.value}
                color={s.color}
                delay={i * 0.15}
                detail={s.detail}
                active={activeIndex === i}
                onActivate={() => setActiveIndex(i)}
              />
              <p className="text-center text-xs font-medium uppercase tracking-wider text-silver/60 md:text-sm">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Detail readout for the active gauge */}
        <div className="mt-8 flex min-h-[3.25rem] items-center justify-center px-4">
          <AnimatePresence mode="wait">
            {active && (
              <motion.p
                key={active.label}
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                className="glass max-w-lg rounded-full px-5 py-2.5 text-center text-xs leading-relaxed text-silver/80 md:text-sm"
                style={{ borderColor: `${active.color}33` }}
              >
                <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: active.color }}>
                  {active.label} ·
                </span>
                {active.detail}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
