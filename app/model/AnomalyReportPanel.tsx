"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import useSWR from "swr";
import { motion, AnimatePresence, useMotionTemplate, useMotionValue, type Variants } from "framer-motion";
import {
  X,
  MapPin,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarClock,
  Radar,
  Sparkles,
  FileText,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  BrainCircuit,
  Satellite,
  Compass,
  ShieldCheck,
  Binoculars,
  Zap,
  Activity,
} from "lucide-react";
import type { CriticalAnomaly } from "@/lib/region-metrics";
import { buildGeneralReport, statusColor } from "@/lib/region-metrics";
import { LiveAnomalyChart } from "./LiveAnomalyChart";

const EASE_OUT: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE_OUT } },
};

type CausalReport = {
  headline: string;
  primaryCause: string;
  contributingFactors: string[];
  historicalContext: string;
  outlook?: string;
  confidence: "low" | "moderate" | "high";
  monitoringRecommendation: string;
};

function SeverityRing({ percent, color }: { percent: number; color: string }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center">
      <svg width={76} height={76} viewBox="0 0 76 76" className="-rotate-90">
        <circle cx={38} cy={38} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
        <motion.circle
          cx={38}
          cy={38}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (percent / 100) * circumference }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          style={{ filter: `drop-shadow(0 0 6px ${color}aa)` }}
        />
      </svg>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="absolute font-display text-base font-bold text-foam"
      >
        {percent}%
      </motion.span>
    </div>
  );
}

/** Reveals `text` a chunk at a time for a "generating" feel without lying about streaming. */
function useTypewriter(text: string | undefined, active: boolean) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!text || !active) {
      setShown(text ?? "");
      return;
    }
    setShown("");
    let i = 0;
    const step = Math.max(2, Math.round(text.length / 70));
    const id = setInterval(() => {
      i += step;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 12);
    return () => clearInterval(id);
  }, [text, active]);
  return shown;
}

type Props = {
  anomaly: CriticalAnomaly | null;
  onClose: () => void;
};

async function fetchCausalReport(anomaly: CriticalAnomaly) {
  const res = await fetch("/api/causal-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      region: anomaly.region,
      metricKey: anomaly.metricKey,
      label: anomaly.label,
      percent: anomaly.percent,
      unit: anomaly.unit,
      occurrences: anomaly.stats.occurrences,
      trend: anomaly.stats.trend,
      weekOverWeek: anomaly.stats.weekOverWeek,
      windowDays: anomaly.stats.windowDays,
    }),
  });
  if (!res.ok) throw new Error("Failed to generate causal report");
  const data = await res.json();
  return data as { report: CausalReport; grounded: boolean; source: "gemini" | "offline"; billingBlocked?: boolean };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function TrendBadge({ trend, weekOverWeek }: { trend: CriticalAnomaly["stats"]["trend"]; weekOverWeek: number }) {
  const Icon = trend === "rising" ? TrendingUp : trend === "falling" ? TrendingDown : Minus;
  const color = trend === "rising" ? "#ff6b6b" : trend === "falling" ? "#4cc9f0" : "#ffd166";
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider" style={{ color }}>
      <Icon className="h-3.5 w-3.5" /> {trend} · {weekOverWeek > 0 ? "+" : ""}{weekOverWeek}% w/w
    </span>
  );
}

const CONFIDENCE_META = {
  low: { color: "#ffd166", label: "Low confidence" },
  moderate: { color: "#4cc9f0", label: "Moderate confidence" },
  high: { color: "#00f5d4", label: "High confidence" },
} as const;

const TABS = [
  { id: "causes", label: "Causal analysis", icon: BrainCircuit },
  { id: "history", label: "History & outlook", icon: Compass },
  { id: "trend", label: "Live trend", icon: Activity },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function AnomalyReportPanel({ anomaly, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<TabId>("causes");
  const { data, error, isLoading, mutate, isValidating } = useSWR(
    anomaly ? `causal-report:${anomaly.region}:${anomaly.metricKey}` : null,
    () => fetchCausalReport(anomaly as CriticalAnomaly),
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 },
  );
  const report = data?.report;
  const revealed = useTypewriter(report?.primaryCause, Boolean(report) && !isValidating);

  const glowX = useMotionValue(-1000);
  const glowY = useMotionValue(-1000);
  const glowBackground = useMotionTemplate`radial-gradient(320px circle at ${glowX}px ${glowY}px, ${
    anomaly ? `${statusColor(anomaly.percent)}22` : "transparent"
  }, transparent 70%)`;
  const handleCardMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    glowX.set(event.clientX - rect.left);
    glowY.set(event.clientY - rect.top);
  };

  useEffect(() => {
    setCopied(false);
    setTab("causes");
  }, [anomaly?.region, anomaly?.metricKey]);

  const handleCopy = async () => {
    if (!report) return;
    const text = [
      report.headline,
      report.primaryCause,
      ...report.contributingFactors.map((f) => `- ${f}`),
      report.historicalContext,
      report.outlook,
      report.monitoringRecommendation,
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <AnimatePresence>
      {anomaly && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-abyssal-navy/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            onMouseMove={handleCardMouseMove}
            whileHover={{ boxShadow: `0 0 60px -8px ${statusColor(anomaly.percent)}55` }}
            className="glass relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 transition-shadow"
          >
            {/* Cursor-following glow */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 rounded-3xl"
              style={{ background: glowBackground }}
            />
            {/* Animated top accent */}
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-3xl"
              style={{ background: `linear-gradient(90deg, transparent, ${statusColor(anomaly.percent)}, transparent)` }}
              initial={{ opacity: 0, scaleX: 0.3 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.6 }}
            />

            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-abyssal-navy/85 p-6 backdrop-blur-xl">
              <motion.div
                key={`${anomaly.region}-${anomaly.metricKey}-header`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35 }}
                className="flex items-center gap-4"
              >
                <SeverityRing percent={anomaly.percent} color={statusColor(anomaly.percent)} />
                <div>
                  <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bio-cyan">
                    <MapPin className="h-3.5 w-3.5" /> {anomaly.region}
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-bold text-foam">{anomaly.label}</h2>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider"
                      style={{ borderColor: `${statusColor(anomaly.percent)}66`, color: statusColor(anomaly.percent) }}
                    >
                      {anomaly.percent}% critical
                    </span>
                    <TrendBadge trend={anomaly.stats.trend} weekOverWeek={anomaly.stats.weekOverWeek} />
                  </div>
                </div>
              </motion.div>
              <motion.button
                type="button"
                onClick={onClose}
                aria-label="Close report"
                whileHover={{ scale: 1.08, rotate: 90 }}
                whileTap={{ scale: 0.92 }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-silver/60 transition hover:border-white/30 hover:text-foam"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            <motion.div variants={listVariants} initial="hidden" animate="show" className="p-6">
              {/* Occurrence stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Detections", value: anomaly.stats.occurrences, icon: Radar },
                  { label: "Window", value: `${anomaly.stats.windowDays}d`, icon: CalendarClock },
                  { label: "First flagged", value: formatDate(anomaly.stats.firstDetected), icon: CalendarClock, small: true },
                  { label: "Last confirmed", value: formatDate(anomaly.stats.lastDetected), icon: CalendarClock, small: true },
                ].map((s) => (
                  <motion.div
                    key={s.label}
                    variants={itemVariants}
                    whileHover={{ y: -3, borderColor: "rgba(255,255,255,0.25)" }}
                    className="rounded-xl border border-white/8 bg-abyssal-navy/50 p-3"
                  >
                    <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/45">
                      <s.icon className="h-3 w-3" /> {s.label}
                    </p>
                    <p className={`mt-1.5 truncate font-display font-bold text-foam ${s.small ? "text-xs" : "text-lg"}`}>{s.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* General report */}
              <motion.div variants={itemVariants} className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-silver/55">
                  <FileText className="h-3.5 w-3.5 text-bio-cyan" /> General report
                </p>
                <p className="mt-3 font-mono text-[12px] leading-relaxed text-silver/75">{buildGeneralReport(anomaly)}</p>
              </motion.div>

              {/* AI causal report — tabbed, animated */}
              <motion.div
                variants={itemVariants}
                className="mt-4 overflow-hidden rounded-2xl border border-plankton/30 bg-gradient-to-br from-plankton/10 via-transparent to-transparent"
              >
                {/* Tab header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 pt-5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      {(isLoading || isValidating) && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-plankton/50" />
                      )}
                      <Sparkles className="relative h-3.5 w-3.5 text-plankton" />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-plankton">
                      Scientific anomaly brief
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {data?.source === "offline" ? (
                      <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-silver/55">
                        Evidence-based fallback
                      </span>
                    ) : (
                      <span
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
                          data?.grounded ? "border-electric-teal/40 text-electric-teal" : "border-white/15 text-silver/55"
                        }`}
                      >
                        <Satellite className="h-2.5 w-2.5" /> {data?.grounded ? "NOAA + PACE grounded" : "Gemini direct"}
                      </span>
                    )}
                    <motion.button
                      type="button"
                      onClick={() => mutate()}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9, rotate: 180 }}
                      aria-label="Regenerate causal analysis"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-silver/50 transition hover:border-plankton/50 hover:text-plankton"
                    >
                      <RefreshCw className={`h-3 w-3 ${isValidating ? "animate-spin" : ""}`} />
                    </motion.button>
                    {report && (
                      <motion.button
                        type="button"
                        onClick={handleCopy}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        aria-label="Copy causal analysis"
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-silver/50 transition hover:border-plankton/50 hover:text-plankton"
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {copied ? (
                            <motion.span key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                              <Check className="h-3 w-3 text-electric-teal" />
                            </motion.span>
                          ) : (
                            <motion.span key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                              <Copy className="h-3 w-3" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    )}
                  </div>
                </div>

                {report && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-5 pt-3 font-display text-sm font-semibold text-foam/90"
                  >
                    {report.headline}
                  </motion.p>
                )}


                {/* Tab switcher */}
                <div className="relative mt-3 flex px-5">
                  {TABS.map((t) => {
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`relative flex items-center gap-1.5 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
                          active ? "text-plankton" : "text-silver/45 hover:text-silver/70"
                        }`}
                      >
                        <t.icon className="h-3 w-3" /> {t.label}
                        {active && (
                          <motion.span
                            layoutId="report-tab-underline"
                            className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-plankton"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          />
                        )}
                      </button>
                    );
                  })}
                  <span className="absolute inset-x-5 bottom-0 h-px bg-white/8" />
                </div>

                <div className="min-h-[9.5rem] p-5">
                  <AnimatePresence mode="wait">
                    {(isLoading || isValidating) && !report && (
                      <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                        <div className="shimmer h-3 w-full rounded" />
                        <div className="shimmer h-3 w-11/12 rounded" />
                        <div className="shimmer h-3 w-4/5 rounded" />
                        <div className="shimmer mt-3 h-3 w-2/3 rounded" />
                      </motion.div>
                    )}
                    {error && !isValidating && (
                      <motion.p
                        key="error"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 font-mono text-[11px] text-coral"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Could not generate the causal analysis.
                        <button type="button" onClick={() => mutate()} className="underline decoration-dotted hover:text-foam">
                          Try again
                        </button>
                      </motion.p>
                    )}
                    {report && tab === "causes" && (
                      <motion.div key="causes" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.25 }}>
                        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-silver/45">
                          <BrainCircuit className="h-3 w-3 text-plankton" /> Primary cause
                        </p>
                        <p className="mt-2 font-mono text-[12px] leading-relaxed text-foam/90">
                          {revealed}
                          {revealed.length < report.primaryCause.length && (
                            <span className="ml-0.5 inline-block h-3 w-1.5 animate-caret bg-plankton align-middle" />
                          )}
                        </p>
                        <p className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-silver/45">
                          <Zap className="h-3 w-3 text-solar" /> Contributing factors
                        </p>
                        <motion.div variants={listVariants} initial="hidden" animate="show" className="mt-2 flex flex-wrap gap-2">
                          {report.contributingFactors.map((f, i) => (
                            <motion.span
                              key={i}
                              variants={itemVariants}
                              whileHover={{ y: -2, borderColor: "rgba(123,97,255,0.5)" }}
                              className="rounded-full border border-white/10 bg-abyssal-navy/50 px-3 py-1.5 font-mono text-[10px] leading-snug text-silver/80"
                            >
                              {f}
                            </motion.span>
                          ))}
                        </motion.div>
                      </motion.div>
                    )}
                    {report && tab === "history" && (
                      <motion.div key="history" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.25 }}>
                        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-silver/45">
                          <Binoculars className="h-3 w-3 text-electric-teal" /> Historical context
                        </p>
                        <p className="mt-2 font-mono text-[12px] leading-relaxed text-foam/90">{report.historicalContext}</p>

                        {report.outlook && (
                          <>
                            <p className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-silver/45">
                              <TrendingUp className="h-3 w-3 text-solar" /> Short-term outlook
                            </p>
                            <p className="mt-2 font-mono text-[12px] leading-relaxed text-foam/90">{report.outlook}</p>
                          </>
                        )}

                        <div className="mt-4 flex items-center gap-2">
                          <span
                            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider"
                            style={{ borderColor: `${CONFIDENCE_META[report.confidence].color}55`, color: CONFIDENCE_META[report.confidence].color }}
                          >
                            <ShieldCheck className="h-3 w-3" /> {CONFIDENCE_META[report.confidence].label}
                          </span>
                        </div>

                        <div className="mt-4 rounded-xl border border-electric-teal/25 bg-electric-teal/5 p-3.5">
                          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-electric-teal">
                            <Radar className="h-3 w-3" /> Keep watching
                          </p>
                          <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-silver/80">{report.monitoringRecommendation}</p>
                        </div>
                      </motion.div>
                    )}
                    {tab === "trend" && (
                      <motion.div key="trend" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.25 }}>
                        <LiveAnomalyChart anomaly={anomaly} color={statusColor(anomaly.percent)} />
                        <p className="mt-3 font-mono text-[9px] leading-relaxed text-silver/40">
                          Backfilled from the last {anomaly.stats.occurrences} logged detections, then continues ticking with
                          a live simulated reading every second while this report stays open.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <p className="border-t border-white/8 px-5 py-2.5 font-mono text-[9px] text-silver/35">
                  {data?.source === "offline"
                    ? "Evidence-based brief built from live NOAA/PACE telemetry and known regional driver patterns — for analyst review, not a verified attribution."
                    : "Probable causes inferred from live NOAA/PACE telemetry and historical regional conditions — for analyst review, not a verified attribution."}
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
