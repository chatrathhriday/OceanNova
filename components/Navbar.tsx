"use client";

import { useState } from "react";
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from "framer-motion";
import { Menu, X, Waves, Volume2, VolumeX, Rocket } from "lucide-react";
import { useLenis } from "@/components/LenisProvider";
import { useToast } from "@/components/Toast";
import { useSound } from "@/components/SoundEngine";
import { WaveField } from "@/components/WaveField";

const LINKS = [
  { label: "The Model", href: "#pipeline" },
  { label: "Live Sources", href: "#innovation" },
  { label: "Workspace", href: "#launch" },
];

export function Navbar() {
  const { scrollTo } = useLenis();
  const { push } = useToast();
  const { enabled: sound, toggle: toggleAmbience } = useSound();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  const toggleSound = () => {
    toggleAmbience();
    if (sound) {
      push("Ambient audio off", "The ocean falls silent.", "info");
    } else {
      push("Ambient audio on", "Deep-ocean soundscape + cursor sounds enabled.", "success");
    }
  };

  const go = (href: string) => {
    setOpen(false);
    setTimeout(() => {
      // on other routes (e.g. /demo) the anchors don't exist — go home first
      if (href.startsWith("#") && !document.querySelector(href)) {
        window.location.assign(`/${href}`);
        return;
      }
      scrollTo(href);
    }, open ? 350 : 0);
  };

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.9, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className={`fixed inset-x-0 top-0 z-[120] transition-all duration-500 ${
          scrolled
            ? "border-b border-bio-cyan/10 bg-abyssal-navy/75 backdrop-blur-xl shadow-[0_12px_40px_-18px_rgba(0,0,0,0.8)]"
            : "bg-transparent"
        }`}
      >
        <nav className="mx-auto flex h-[70px] max-w-7xl items-center justify-between px-5 md:px-8">
          <button
            onClick={() => scrollTo(0)}
            className="group flex items-center gap-2.5"
            aria-label="OCEANNOVA home"
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-bio-cyan/30 bg-deep-ocean/60">
              <Waves className="h-4.5 w-4.5 h-5 w-5 text-bio-cyan transition-transform duration-500 group-hover:rotate-12" />
              <span className="absolute inset-0 rounded-xl bg-bio-cyan/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
            </span>
            <span className="font-display text-lg font-700 font-bold tracking-[0.18em] text-foam">
              OCEAN<span className="text-bio-cyan">NOVA</span>
            </span>
          </button>

          <div className="hidden items-center gap-8 lg:flex">
            {LINKS.map((l) => (
              <button
                key={l.href}
                onClick={() => go(l.href)}
                className="wave-link font-mono text-[12px] uppercase tracking-[0.18em] text-silver/85 transition-colors hover:text-foam"
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleSound}
              data-tip={sound ? "Mute ocean" : "Ocean ambience"}
              className="bubble-tip relative flex h-10 w-10 items-center justify-center rounded-full border border-bio-cyan/25 bg-deep-ocean/50 text-silver transition hover:border-bio-cyan/60 hover:text-bio-cyan"
              aria-label="Toggle ambient ocean sound"
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {sound && (
                <span className="absolute inset-0 rounded-full border border-bio-cyan/50 animate-ripple-ring" />
              )}
            </button>
            <a
              href="/model"
              className="hidden items-center gap-2 rounded-full bg-bio-cyan/10 border border-bio-cyan/40 px-5 py-2 font-display text-sm font-semibold text-bio-cyan transition hover:bg-bio-cyan hover:text-abyssal-navy hover:shadow-[0_0_28px_-4px_rgba(0,245,212,0.8)] md:flex"
            >
              <Rocket className="h-4 w-4" />
              Launch Model
            </a>
            <button
              onClick={() => setOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-bio-cyan/25 bg-deep-ocean/50 text-foam lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </nav>
      </motion.header>

      {/* Full-screen ocean overlay menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ clipPath: "circle(0% at 92% 6%)" }}
            animate={{ clipPath: "circle(150% at 92% 6%)" }}
            exit={{ clipPath: "circle(0% at 92% 6%)" }}
            transition={{ duration: 0.7, ease: [0.7, 0, 0.2, 1] }}
            className="fixed inset-0 z-[160] flex flex-col overflow-hidden bg-gradient-to-b from-deep-ocean via-abyssal-navy to-[#050c18]"
          >
            <div className="dot-grid absolute inset-0 opacity-40" />
            <WaveField className="opacity-80" intensity={1.35} />
            <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-plankton/15 blur-[100px]" />
            <div className="absolute -right-20 bottom-1/4 h-80 w-80 rounded-full bg-bio-cyan/10 blur-[110px]" />

            <div className="relative flex h-[70px] items-center justify-between px-5 md:px-8">
              <span className="font-display text-lg font-bold tracking-[0.18em] text-foam">
                OCEAN<span className="text-bio-cyan">NOVA</span>
              </span>
              <button
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-bio-cyan/25 text-foam"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex flex-1 flex-col items-start justify-center gap-1 px-8">
              {LINKS.map((l, i) => (
                <motion.button
                  key={l.href}
                  initial={{ x: -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -40, opacity: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                  onClick={() => go(l.href)}
                  className="group flex items-baseline gap-4 py-2"
                >
                  <span className="font-mono text-xs text-electric-teal">0{i + 1}</span>
                  <span className="font-display text-4xl font-bold text-silver transition-all duration-300 group-hover:translate-x-2 group-hover:text-bio-cyan md:text-5xl">
                    {l.label}
                  </span>
                </motion.button>
              ))}
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 0.6 }}
              className="relative px-8 pb-10 font-mono text-[11px] uppercase tracking-[0.3em] text-silver"
            >
              Decode the deep — detect the unseen
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
