"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, ScanSearch, Boxes, HelpCircle } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

type Tab = {
  id: string;
  chip: string;
  title: string;
  icon: typeof Radar;
  accent: string;
  body: string;
  points: string[];
  method: string;
};

const TABS: Tab[] = [
  {
    id: "detect",
    chip: "01 · DETECT",
    title: "Detect the anomaly",
    icon: Radar,
    accent: "#00BBF9",
    body: "Every PACE OCI L2 spectrum passes quality control, denoising, derivatives, continuum features and PCA before seven complementary novelty detectors compare it with a learned normal-ocean manifold. Detector disagreement is retained as uncertainty.",
    points: [
      "PACE quality flags are applied before spectral inference",
      "Seven novelty detectors vote against the normal-ocean manifold",
      "Detector disagreement becomes an explicit uncertainty signal",
    ],
    method: "7-model novelty ensemble",
  },
  {
    id: "explain",
    chip: "02 · EXPLAIN",
    title: "Explain what changed",
    icon: ScanSearch,
    accent: "#00F5D4",
    body: "For each flagged pixel the model compares its full spectrum against the expected baseline and surfaces the wavelengths that deviate most — turning an opaque score into a readable, physical fingerprint.",
    points: [
      "Observed spectrum diffed against the regional expectation",
      "Top deviating wavelengths ranked and returned as evidence",
      "Chlorophyll / CDOM / sediment bands called out by name",
    ],
    method: "Spectral residual attribution",
  },
  {
    id: "classify",
    chip: "03 · CLASSIFY",
    title: "Classify the cause",
    icon: Boxes,
    accent: "#7B61FF",
    body: "A heterogeneous ensemble combines tree models, gradient boosting, an MLP, RBF-SVM, QDA and a learned stacking meta-model using spectral and environmental context. The OOD gate can reject every known cause.",
    points: [
      "Seven heterogeneous classifiers plus a stacking meta-model",
      "Spectral + chlorophyll/nFLH + geographic context when available",
      "Confidence, entropy and model disagreement exposed",
    ],
    method: "Stacked multimodal ensemble",
  },
  {
    id: "unknown",
    chip: "04 · FLAG THE UNKNOWN",
    title: "Flag the unknown",
    icon: HelpCircle,
    accent: "#FF6B6B",
    body: "When a signature matches no known class, the model refuses to guess. It labels the event unknown_mixed and routes it to researchers — the out-of-distribution cases are exactly where new science begins.",
    points: [
      "Out-of-distribution detection on low-confidence predictions",
      "Ambiguous events tagged unknown_mixed rather than forced",
      "Queued for human review with full spectral evidence",
    ],
    method: "OOD gating",
  },
];

export function RawDataInsight() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];

  return (
    <section id="pipeline" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-60" />
      <div aria-hidden className="dot-grid absolute inset-0 opacity-30" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 01 — The Model
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section max-w-3xl text-foam">
            From Raw Data to <span className="text-gradient">Real Insights</span>
          </h2>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-silver/70">
            OCEANNOVA turns raw NASA PACE ocean-color granules into explained,
            classified anomalies through a four-stage pipeline. It never waits to be
            fed data — it continuously ingests from the sources itself.
          </p>
        </Reveal>

        {/* Tabs */}
        <div className="mt-14">
          <div role="tablist" aria-label="Model pipeline stages" className="flex flex-wrap gap-3">
            {TABS.map((t, i) => {
              const on = i === active;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(i)}
                  className={`group relative flex items-center gap-2.5 rounded-full border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] transition-all ${
                    on
                      ? "text-abyssal-navy"
                      : "border-white/10 text-silver/60 hover:border-white/25 hover:text-foam"
                  }`}
                  style={on ? { background: t.accent, borderColor: t.accent } : undefined}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.chip}
                </button>
              );
            })}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                className="glass relative overflow-hidden rounded-3xl p-8"
              >
                <div
                  aria-hidden
                  className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-25 blur-3xl"
                  style={{ background: tab.accent }}
                />
                <div
                  className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border bg-abyssal-navy/70"
                  style={{ borderColor: `${tab.accent}55` }}
                >
                  <tab.icon className="h-6 w-6" style={{ color: tab.accent }} />
                </div>
                <h3 className="font-display text-2xl font-bold text-foam md:text-3xl">{tab.title}</h3>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-silver/75">{tab.body}</p>
                <span
                  className="mt-6 inline-block rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
                  style={{ borderColor: `${tab.accent}44`, color: tab.accent }}
                >
                  {tab.method}
                </span>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.ul
                key={tab.id + "-points"}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                className="glass flex flex-col justify-center gap-4 rounded-3xl p-8"
              >
                {tab.points.map((p, i) => (
                  <li key={i} className="flex items-start gap-3.5">
                    <span
                      className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                      style={{ background: `${tab.accent}22`, color: tab.accent, border: `1px solid ${tab.accent}55` }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-silver/80">{p}</span>
                  </li>
                ))}
              </motion.ul>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
