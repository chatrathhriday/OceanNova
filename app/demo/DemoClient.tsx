"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Database, Dices, RefreshCcw, Trash2, Radar, MapPin,
  ShieldAlert, Terminal, CircleCheck, CircleX, ExternalLink,
} from "lucide-react";
import { RippleButton } from "@/components/RippleButton";
import { WaveField } from "@/components/WaveField";
import { useToast } from "@/components/Toast";
import type { AnomalyRecord } from "@/lib/mock";

type Stats = {
  ok: boolean;
  database: string;
  total: number;
  bySeverity: Record<string, number>;
};

const SEV_STYLE = {
  high: { color: "#FF6B6B", bg: "rgba(255,107,107,0.12)" },
  medium: { color: "#FFC857", bg: "rgba(255,200,87,0.12)" },
  low: { color: "#00F5D4", bg: "rgba(0,245,212,0.12)" },
} as const;

function timeAgo(iso: string) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function DemoClient({ dbUrl }: { dbUrl: string }) {
  const { push } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<AnomalyRecord[]>([]);
  const [busy, setBusy] = useState<null | "add" | "reset">(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        fetch("/api/seed", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/anomalies", { cache: "no-store" }).then((r) => r.json()),
      ]);
      // an unreachable database answers with just { ok, database } — no counts
      setStats({ total: 0, bySeverity: {}, ...(s as Partial<Stats>) } as Stats);
      setRows((a as { data: AnomalyRecord[] }).data ?? []);
    } catch {
      setStats({ ok: false, database: "unreachable", total: 0, bySeverity: {} });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const generate = async (reset: boolean) => {
    setBusy(reset ? "reset" : "add");
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: reset ? 40 : 24, reset }),
      });
      const json = (await res.json()) as { ok: boolean; inserted?: number; total?: number };
      if (json.ok) {
        push(
          reset ? "Dataset regenerated" : "Demo data generated",
          `${json.inserted} anomalies written to PostgreSQL — ${json.total} total in the table.`,
          "success"
        );
      } else {
        push("Generation failed", "The database rejected the batch.", "warning");
      }
    } catch {
      push("Generation failed", "Could not reach the seed endpoint.", "warning");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const sevTotal = (stats?.bySeverity.high ?? 0) + (stats?.bySeverity.medium ?? 0) + (stats?.bySeverity.low ?? 0) || 1;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <WaveField className="opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[42rem] -translate-x-1/2 rounded-full bg-plankton/8 blur-[140px]" />

      <div className="relative mx-auto max-w-6xl px-5 pb-28 pt-32 md:px-8">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}>
          <Link href="/" className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-silver/60 transition-colors hover:text-bio-cyan">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the surface
          </Link>

          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> Live Demo
          </p>
          <h1 className="h-section text-foam">
            Database <span className="text-gradient">Console</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-silver/70">
            This console talks to the same PostgreSQL instance that powers the
            Detection Hub. Generate a fresh batch of anomalies here, then open the
            hub and run the sample analysis to see them surface.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {/* Connection card */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7 }} className="glass rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-bio-cyan/40 bg-abyssal-navy/60">
                <Database className="h-5 w-5 text-bio-cyan" />
              </span>
              <h2 className="font-display text-lg font-bold text-foam">Connection</h2>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-abyssal-navy/60 p-4">
              <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-electric-teal" />
              <code className="break-all font-mono text-xs leading-relaxed text-silver/85">{dbUrl}</code>
            </div>
            <div className="mt-4 flex items-center gap-2.5">
              {loading ? (
                <span className="shimmer h-5 w-32 rounded-full" />
              ) : stats?.ok ? (
                <span className="flex items-center gap-2 rounded-full border border-bio-cyan/40 bg-bio-cyan/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-bio-cyan">
                  <CircleCheck className="h-3.5 w-3.5" /> connected · {stats.total} rows
                </span>
              ) : (
                <span className="flex items-center gap-2 rounded-full border border-coral/40 bg-coral/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-coral">
                  <CircleX className="h-3.5 w-3.5" /> unreachable
                </span>
              )}
            </div>

            {/* severity mix */}
            <p className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-silver/50">Severity mix</p>
            <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full">
              {(["high", "medium", "low"] as const).map((k) => (
                <motion.div
                  key={k}
                  className="h-full rounded-full"
                  style={{ background: SEV_STYLE[k].color, boxShadow: `0 0 8px ${SEV_STYLE[k].color}` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${((stats?.bySeverity[k] ?? 0) / sevTotal) * 100}%` }}
                  transition={{ duration: 0.8 }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-silver/60">
              <span className="text-coral">{stats?.bySeverity.high ?? 0} high</span>
              <span className="text-solar">{stats?.bySeverity.medium ?? 0} medium</span>
              <span className="text-bio-cyan">{stats?.bySeverity.low ?? 0} low</span>
            </div>
          </motion.div>

          {/* Generator card */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.7 }} className="glass flex flex-col rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-plankton/40 bg-abyssal-navy/60">
                <Dices className="h-5 w-5 text-plankton" />
              </span>
              <h2 className="font-display text-lg font-bold text-foam">Generate data</h2>
            </div>
            <p className="text-sm leading-relaxed text-silver/70">
              Randomized across 12 ocean regions, 8 parameters, with σ-deviation
              severity scoring — detected timestamps spread over the last 72 hours.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <RippleButton variant="primary" onClick={() => generate(false)} disabled={busy !== null}>
                <Dices className="h-4.5 w-4.5 h-5 w-5" />
                {busy === "add" ? "Writing batch…" : "Generate 24 anomalies"}
              </RippleButton>
              <RippleButton variant="ghost" onClick={() => generate(true)} disabled={busy !== null}>
                <Trash2 className="h-4.5 w-4.5 h-5 w-5" />
                {busy === "reset" ? "Regenerating…" : "Reset table + 40 fresh"}
              </RippleButton>
              <Link
                href="/#hub"
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full border border-electric-teal/40 px-6 py-3 font-display text-sm font-semibold text-electric-teal transition hover:bg-electric-teal/10 hover:shadow-[0_0_28px_-6px_rgba(0,187,249,0.7)]"
              >
                <Radar className="h-4 w-4" /> Open Detection Hub <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>

          {/* Endpoints card */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26, duration: 0.7 }} className="glass rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-electric-teal/40 bg-abyssal-navy/60">
                <Terminal className="h-5 w-5 text-electric-teal" />
              </span>
              <h2 className="font-display text-lg font-bold text-foam">Endpoints</h2>
            </div>
            <div className="space-y-3 font-mono text-xs">
              {[
                { m: "GET", p: "/api/anomalies", d: "Latest 24 flagged anomalies" },
                { m: "GET", p: "/api/seed", d: "DB status + severity counts" },
                { m: "POST", p: "/api/seed", d: '{ count: 40, reset: true }' },
                { m: "GET", p: "/api/health", d: "Platform healthcheck" },
              ].map((e) => (
                <div key={e.m + e.p} className="rounded-xl border border-white/5 bg-abyssal-navy/50 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${e.m === "POST" ? "bg-plankton/20 text-plankton" : "bg-bio-cyan/15 text-bio-cyan"}`}>{e.m}</span>
                    <span className="text-foam">{e.p}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-silver/55">{e.d}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Live table */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.7 }} className="glass mt-6 overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-4.5 w-4.5 h-5 w-5 text-coral" />
              <h2 className="font-display text-lg font-bold text-foam">Latest anomalies</h2>
            </div>
            <button
              onClick={refresh}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-silver/70 transition hover:border-bio-cyan/50 hover:text-bio-cyan"
            >
              <RefreshCcw className="h-3 w-3" /> Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.2em] text-silver/50">
                  <th className="px-6 py-3.5">Event</th>
                  <th className="px-4 py-3.5">Severity</th>
                  <th className="px-4 py-3.5">Region</th>
                  <th className="px-4 py-3.5">Deviation</th>
                  <th className="px-4 py-3.5">Confidence</th>
                  <th className="px-6 py-3.5 text-right">Detected</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td colSpan={6} className="px-6 py-3.5"><div className="shimmer h-5 w-full rounded" /></td>
                      </tr>
                    ))
                  : rows.slice(0, 8).map((a) => {
                      const s = SEV_STYLE[a.severity] ?? SEV_STYLE.medium;
                      return (
                        <tr key={a.id} className="border-t border-white/5 transition-colors hover:bg-white/[0.03]">
                          <td className="px-6 py-3.5">
                            <p className="font-display text-sm font-semibold text-foam">{a.title}</p>
                            <p className="font-mono text-[10px] text-silver/55">{a.parameter} · {a.value}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="rounded-full px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.15em]" style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}55` }}>
                              {a.severity.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="flex items-center gap-1.5 font-mono text-[11px] text-silver/70">
                              <MapPin className="h-3 w-3 text-electric-teal" /> {a.region.trim()}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs" style={{ color: s.color }}>
                            {a.deviation > 0 ? "+" : ""}{a.deviation.toFixed(1)}σ
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1 w-16 overflow-hidden rounded-full bg-white/5">
                                <div className="h-full rounded-full" style={{ width: `${a.confidence * 100}%`, background: s.color }} />
                              </div>
                              <span className="font-mono text-[10px] text-silver/55">{Math.round(a.confidence * 100)}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono text-[11px] text-silver/55">{timeAgo(a.detectedAt)}</td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
