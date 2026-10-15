"use client";

import { Waves, Globe, AtSign, Share2, Mail } from "lucide-react";
import { WaveDivider } from "@/components/WaveDivider";
import { WaveField } from "@/components/WaveField";
import { useLenis } from "@/components/LenisProvider";

const LINKS = [
  { label: "Mission", href: "#pipeline" },
  { label: "Features", href: "#launch" },
];

export function Footer() {
  const { scrollTo } = useLenis();

  return (
    <footer className="relative bg-abyssal-navy">
      <WaveDivider topColor="transparent" bottomColor="#060D1A" />

      <div className="relative overflow-hidden bg-[#060D1A] pb-12 pt-6">
        <WaveField className="opacity-50" />
        {/* underwater ambient */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-deep-ocean/60 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-bio-cyan/6 blur-[100px]" />
        <div aria-hidden className="pointer-events-none absolute -right-20 bottom-10 h-56 w-56 rounded-full bg-plankton/8 blur-[90px]" />
        {/* rising bubbles */}
        {[...Array(8)].map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute bottom-0 rounded-full border border-bio-cyan/25 bg-bio-cyan/5 animate-rise"
            style={{
              left: `${6 + i * 12}%`,
              width: `${4 + (i % 4) * 3}px`,
              height: `${4 + (i % 4) * 3}px`,
              animationDuration: `${7 + (i % 4) * 2.5}s`,
              animationDelay: `${i * 1.1}s`,
            }}
          />
        ))}

        <div className="relative mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-col items-center gap-8 border-b border-white/5 pb-10 md:flex-row md:items-start md:justify-between">
            {/* Brand */}
            <div className="text-center md:text-left">
              <button onClick={() => scrollTo(0)} className="group inline-flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-bio-cyan/30 bg-deep-ocean/60">
                  <Waves className="h-5 w-5 text-bio-cyan transition-transform duration-500 group-hover:rotate-12" />
                </span>
                <span className="font-display text-xl font-bold tracking-[0.18em] text-foam">
                  OCEAN<span className="text-bio-cyan">NOVA</span>
                </span>
              </button>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-silver/60">
                Decode the deep. Detect the unseen. An AI-powered early-warning
                system for our planet's largest habitat.
              </p>
            </div>

            {/* Quick links */}
            <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
              {LINKS.map((l) => (
                <button
                  key={l.href}
                  onClick={() => scrollTo(l.href)}
                  className="wave-link font-mono text-[11px] uppercase tracking-[0.2em] text-silver/70 transition-colors hover:text-foam"
                >
                  {l.label}
                </button>
              ))}
            </nav>

            {/* Socials */}
            <div className="flex gap-3">
              {[Globe, AtSign, Share2, Mail].map((Icon, i) => (
                <button
                  key={i}
                  aria-label="Social link"
                  className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-bio-cyan/20 bg-deep-ocean/40 text-silver/70 transition-all duration-300 hover:-translate-y-1 hover:border-bio-cyan/60 hover:text-bio-cyan hover:shadow-[0_0_24px_-4px_rgba(0,245,212,0.7)]"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-silver/50">
              Made with <Waves className="h-3.5 w-3.5 text-bio-cyan" /> at OceanHack 2026
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-silver/40">
              71% of Earth. 100% of our attention.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
