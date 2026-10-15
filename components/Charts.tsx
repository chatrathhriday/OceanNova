"use client";

import { useId } from "react";
import { motion } from "framer-motion";

/* ─────────────── Line / area chart (responsive via viewBox) ─────────────── */
export function LineChart({
  data,
  height = 180,
  strokeFrom = "#1DA2D8",
  strokeTo = "#7FCDFF",
  showArea = true,
  animated = true,
  highlightLast = true,
  labels,
}: {
  data: number[];
  height?: number;
  strokeFrom?: string;
  strokeTo?: string;
  showArea?: boolean;
  animated?: boolean;
  highlightLast?: boolean;
  labels?: string[];
}) {
  const gid = useId().replace(/:/g, "");
  const W = 100;
  const H = 42;
  const max = Math.max(...data) * 1.15;
  const min = Math.min(...data) * 0.85;
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 6) - 3,
  }));

  // smooth path (Catmull-Rom → bezier)
  const path = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x},${p.y}`;
    const prev = pts[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
  }, "");
  const area = `${path} L ${W},${H} L 0,${H} Z`;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`ls-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={strokeFrom} />
            <stop offset="100%" stopColor={strokeTo} />
          </linearGradient>
          <linearGradient id={`as-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeFrom} stopOpacity="0.30" />
            <stop offset="100%" stopColor={strokeFrom} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(201,214,223,0.09)" strokeWidth="0.2" strokeDasharray="1.5 1.5" />
        ))}

        {showArea && (
          <motion.path
            d={area}
            fill={`url(#as-${gid})`}
            initial={animated ? { opacity: 0 } : { opacity: 1 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, delay: 0.5 }}
          />
        )}
        <motion.path
          d={path}
          fill="none"
          stroke={`url(#ls-${gid})`}
          strokeWidth="0.9"
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 3px rgba(0,245,212,0.6))" }}
          initial={animated ? { pathLength: 0 } : { pathLength: 1 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: [0.3, 0.7, 0.2, 1] }}
        />
        {highlightLast && (
          <g>
            <motion.circle
              cx={pts[pts.length - 1].x}
              cy={pts[pts.length - 1].y}
              r="1.6"
              fill={strokeFrom}
              initial={animated ? { scale: 0, opacity: 0 } : {}}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 1.9 }}
            />
            <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.4" fill="none" stroke={strokeFrom} strokeWidth="0.3" opacity="0.5">
              <animate attributeName="r" values="2;5;2" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </svg>
      {labels && (
        <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-wider text-silver/50">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Sparkline for live feed ─────────────── */
export function Sparkline({
  data,
  color = "#1DA2D8",
  height = 44,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const W = 100;
  const H = 24;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / Math.max(1, data.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 4) - 2,
  }));
  const path = pts.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  );
}

/* ─────────────── Radial gauge ─────────────── */
export function Gauge({ value, label, color = "#7FCDFF" }: { value: number; label: string; color?: string }) {
  const angle = -120 + value * 240;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-0">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(201,214,223,0.12)" strokeWidth="7" strokeLinecap="round" strokeDasharray="168" strokeDashoffset="42" transform="rotate(150 50 50)" />
          <motion.circle
            cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray="168"
            transform="rotate(150 50 50)"
            style={{ filter: `drop-shadow(0 0 5px ${color})` }}
            initial={{ strokeDashoffset: 168 }}
            whileInView={{ strokeDashoffset: 168 - value * 126 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <motion.line
            x1="50" y1="50" x2="50" y2="18"
            stroke="#F0F7FF" strokeWidth="2" strokeLinecap="round"
            initial={{ rotate: -120 }}
            whileInView={{ rotate: angle }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ transformOrigin: "50px 50px" }}
          />
          <circle cx="50" cy="50" r="4" fill="#F0F7FF" />
        </svg>
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-silver/70">{label}</p>
    </div>
  );
}

/* ─────────────── Heatmap ─────────────── */
export function Heatmap({ seed, cols = 12, rows = 7 }: { seed: number[]; cols?: number; rows?: number }) {
  // data-viz gradient: cyan → solar → coral
  const colorFor = (v: number) => {
    if (v < 0.5) {
      const t = v / 0.5;
      return `rgb(${Math.round(0 + 255 * t)}, ${Math.round(245 - 45 * t)}, ${Math.round(212 - 125 * t)})`;
    }
    const t = (v - 0.5) / 0.5;
    return `rgb(${Math.round(255)}, ${Math.round(200 - 93 * t)}, ${Math.round(87 + 20 * t)})`;
  };
  return (
    <div
      className="grid w-full gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
    >
      {Array.from({ length: cols * rows }).map((_, i) => {
        const v = seed[i % seed.length];
        const hot = v > 0.72;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.4 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ delay: i * 0.008, duration: 0.45 }}
            data-tip={`Anomaly index ${(v * 100).toFixed(0)}%`}
            className={`bubble-tip aspect-square rounded-[4px] transition-transform duration-300 hover:scale-125 hover:z-10 ${hot ? "animate-pulse" : ""}`}
            style={{
              background: colorFor(v),
              opacity: 0.22 + v * 0.75,
              boxShadow: hot ? "0 0 12px rgba(255,107,107,0.55)" : v > 0.5 ? "0 0 8px rgba(255,200,87,0.35)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}

/* ─────────────── Mini map with pulsing pins ─────────────── */
export type MapPin = {
  id: number;
  lat: number;
  lng: number;
  severity: "low" | "medium" | "high";
  label: string;
};

const SEV_COLOR = { low: "#1DA2D8", medium: "#FFC857", high: "#FF6B6B" } as const;

export function MiniMap({ pins }: { pins: MapPin[] }) {
  return (
    <div className="dot-grid relative aspect-[2.1/1] w-full overflow-hidden rounded-xl border border-electric-teal/15 bg-abyssal-navy/50">
      {/* graticule */}
      <div className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,187,249,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0,187,249,0.12) 1px, transparent 1px)",
          backgroundSize: "12.5% 20%",
        }}
      />
      {/* radar sweep */}
      <div className="absolute left-1/2 top-1/2 h-[190%] w-[70%] -translate-x-1/2 -translate-y-1/2 animate-spin-slower opacity-25"
        style={{ background: "conic-gradient(from 0deg, transparent 0deg, rgba(0,245,212,0.35) 32deg, transparent 60deg)" }}
      />
      {pins.map((p) => {
        const left = `${((p.lng + 180) / 360) * 100}%`;
        const top = `${((90 - p.lat) / 180) * 100}%`;
        const c = SEV_COLOR[p.severity];
        return (
          <div
            key={p.id}
            className="bubble-tip group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left, top }}
            data-tip={p.label}
          >
            <span className="absolute inset-0 -m-1.5 rounded-full animate-ping-soft" style={{ background: c, opacity: 0.35 }} />
            <span
              className="relative block h-2.5 w-2.5 rounded-full border border-white/40 transition-transform duration-300 group-hover:scale-150"
              style={{ background: c, boxShadow: `0 0 12px ${c}` }}
            />
          </div>
        );
      })}
      {/* corner ticks */}
      <div className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2 border-bio-cyan/50" />
      <div className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2 border-bio-cyan/50" />
      <div className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 border-bio-cyan/50" />
      <div className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-bio-cyan/50" />
      <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.3em] text-electric-teal/70">
        Global anomaly grid
      </span>
    </div>
  );
}
