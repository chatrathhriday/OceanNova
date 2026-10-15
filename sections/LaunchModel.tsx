"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Rocket, ArrowUpRight, Satellite, Database, Cpu } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

const STREAM = [
  { icon: Satellite, label: "NASA PACE OCI" },
  { icon: Database, label: "NOAA HAB + SST" },
  { icon: Cpu, label: "Detect · Explain · Classify" },
];

export function LaunchModel() {
  return (
    <section id="launch" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-60" />
      <div aria-hidden className="dot-grid absolute inset-0 opacity-20" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bio-cyan/8 blur-[150px]" />

      <div className="relative mx-auto max-w-4xl px-5 text-center md:px-8">
        <Reveal>
          <p className="mb-5 flex items-center justify-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 03 — The Workspace <span className="inline-block h-px w-10 bg-bio-cyan/60" />
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section text-foam">
            Launch the <span className="text-gradient">Live Model</span>
          </h2>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-silver/70">
            The model doesn&apos;t need you to upload anything. It already streams from
            NASA PACE and NOAA, runs the full detection pipeline, and surfaces
            explained, classified anomalies in a dedicated workspace.
          </p>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mx-auto mt-10 flex max-w-lg flex-wrap items-center justify-center gap-3">
            {STREAM.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-abyssal-navy/50 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-silver/70">
                  <s.icon className="h-3.5 w-3.5 text-bio-cyan" /> {s.label}
                </span>
                {i < STREAM.length - 1 && <span aria-hidden className="text-bio-cyan/50">→</span>}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.3}>
          <motion.div whileHover={{ scale: 1.02 }} className="mt-12 inline-block">
            <Link
              href="/model"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-bio-cyan px-9 py-4 font-display text-base font-bold tracking-wide text-abyssal-navy shadow-[0_0_46px_-6px_rgba(0,245,212,0.8),0_18px_50px_-14px_rgba(0,245,212,0.6)] transition-all hover:-translate-y-0.5"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Rocket className="h-5 w-5" />
              Launch Model Workspace
              <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </motion.div>
        </Reveal>
        <Reveal delay={0.36}>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.3em] text-silver/40">
            Opens the OCEANNOVA detection workspace
          </p>
        </Reveal>
      </div>
    </section>
  );
}
