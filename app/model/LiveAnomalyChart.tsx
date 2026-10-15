"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import type { CriticalAnomaly } from "@/lib/region-metrics";

type Point = { t: number; v: number };

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Hours of deterministic backfilled history rendered before the live tail starts ticking.
const HISTORY_LENGTH = 24;
// Sliding window size once live points start appending every second.
const MAX_POINTS = 42;

/** Deterministic pseudo-random walk that eases toward the anomaly's current severity, so the
 * chart's history reads as "how it got here" rather than random noise. */
function buildHistory(anomaly: CriticalAnomaly): Point[] {
  const seed = hash(`${anomaly.region}:${anomaly.metricKey}:trend`);
  const points: Point[] = [];
  let value = Math.max(8, anomaly.percent - 28 - (seed % 18));
  for (let i = 0; i < HISTORY_LENGTH; i++) {
    const stepSeed = hash(`${seed}:${i}`);
    const remaining = HISTORY_LENGTH - i;
    const drift = (anomaly.percent - value) / (remaining + 2);
    const noise = ((stepSeed % 700) / 100) - 3.5;
    value = Math.min(100, Math.max(0, value + drift + noise));
    points.push({ t: i, v: Math.round(value * 10) / 10 });
  }
  points[points.length - 1] = { t: HISTORY_LENGTH - 1, v: anomaly.percent };
  return points;
}

export function LiveAnomalyChart({ anomaly, color }: { anomaly: CriticalAnomaly; color: string }) {
  const [points, setPoints] = useState<Point[]>(() => buildHistory(anomaly));
  const tickRef = useRef(HISTORY_LENGTH - 1);
  const lastValueRef = useRef(anomaly.percent);

  // Reset the whole series when the user opens a different anomaly's chart.
  useEffect(() => {
    setPoints(buildHistory(anomaly));
    tickRef.current = HISTORY_LENGTH - 1;
    lastValueRef.current = anomaly.percent;
  }, [anomaly.region, anomaly.metricKey]);

  // Live tail: appends one new reading every second, gently mean-reverting toward the
  // anomaly's confirmed severity so the tail stays plausible rather than drifting away.
  useEffect(() => {
    const id = window.setInterval(() => {
      tickRef.current += 1;
      const jitter = (Math.random() - 0.5) * 3.2;
      const reversion = (anomaly.percent - lastValueRef.current) * 0.08;
      const next = Math.min(100, Math.max(0, lastValueRef.current + jitter + reversion));
      lastValueRef.current = next;
      setPoints((prev) => {
        const nextPoints = [...prev, { t: tickRef.current, v: Math.round(next * 10) / 10 }];
        return nextPoints.length > MAX_POINTS ? nextPoints.slice(nextPoints.length - MAX_POINTS) : nextPoints;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [anomaly.percent]);

  const width = 560;
  const height = 140;
  const padding = 8;

  const { path, areaPath, latest } = useMemo(() => {
    if (points.length === 0) return { path: "", areaPath: "", latest: anomaly.percent };
    const minT = points[0].t;
    const maxT = points[points.length - 1].t;
    const spanT = Math.max(1, maxT - minT);
    const toX = (t: number) => padding + ((t - minT) / spanT) * (width - padding * 2);
    const toY = (v: number) => height - padding - (v / 100) * (height - padding * 2);
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.t).toFixed(1)} ${toY(p.v).toFixed(1)}`).join(" ");
    const area = `${linePath} L ${toX(points[points.length - 1].t).toFixed(1)} ${height - padding} L ${toX(points[0].t).toFixed(1)} ${height - padding} Z`;
    return { path: linePath, areaPath: area, latest: points[points.length - 1].v };
  }, [points, anomaly.percent]);

  const gradientId = `chart-fill-${anomaly.metricKey}-${anomaly.region.replace(/\s+/g, "")}`;

  return (
    <div className="rounded-2xl border border-white/8 bg-abyssal-navy/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-silver/45">
          <Activity className="h-3 w-3" style={{ color }} /> Past behavior · live severity trend
        </p>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-silver/50">
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
              style={{ backgroundColor: color }}
            />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          </span>
          Live · updates every 1s
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((gridV) => (
          <line
            key={gridV}
            x1={padding}
            x2={width - padding}
            y1={height - padding - (gridV / 100) * (height - padding * 2)}
            y2={height - padding - (gridV / 100) * (height - padding * 2)}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="4 4"
          />
        ))}
        <motion.path d={areaPath} fill={`url(#${gradientId})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* Live leading point pulse */}
        {points.length > 0 && (
          <circle
            cx={padding + ((points[points.length - 1].t - points[0].t) / Math.max(1, points[points.length - 1].t - points[0].t)) * (width - padding * 2)}
            cy={height - padding - (points[points.length - 1].v / 100) * (height - padding * 2)}
            r={3.5}
            fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        )}
      </svg>

      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-silver/40">
        <span>-{HISTORY_LENGTH}h</span>
        <span className="font-bold" style={{ color }}>
          {latest.toFixed(1)}% now
        </span>
        <span>now</span>
      </div>
    </div>
  );
}
