"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown, Radar, Telescope } from "lucide-react";
import { RippleButton } from "@/components/RippleButton";
import { MagneticButton } from "@/components/MagneticButton";
import { SonarPing } from "@/components/SonarPing";
import { useLenis } from "@/components/LenisProvider";

const OceanScene = dynamic(() => import("@/three/OceanScene"), { ssr: false });

const TAGLINE = "Decode the Deep. Detect the Unseen.";
const LOGO = "OCEANNOVA";

function useTypewriter(text: string, start: boolean, speed = 46) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!start) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, start, speed]);
  return out;
}

function useLiteMode() {
  const [lite, setLite] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.innerWidth < 760;
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const webgl = (() => {
      try {
        const c = document.createElement("canvas");
        return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
      } catch {
        return false;
      }
    })();
    setLite(reduced || !webgl || (coarse && narrow) || (weak && narrow));
  }, []);
  return lite;
}

/* CSS fallback ocean for low-end devices */
function LiteOcean() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 animate-gradient-pan"
        style={{
          background:
            "linear-gradient(160deg, #0A1628 0%, #0D2137 34%, #103a4a 62%, #0A1628 100%)",
          backgroundSize: "180% 180%",
        }}
      />
      <div className="absolute left-[12%] top-[30%] h-64 w-64 rounded-full bg-bio-cyan/10 blur-[80px] animate-glow-pulse" />
      <div className="absolute right-[8%] top-[52%] h-72 w-72 rounded-full bg-plankton/10 blur-[90px] animate-glow-pulse" style={{ animationDelay: "1.4s" }} />
      <svg className="absolute bottom-0 left-0 w-[200%] animate-wave-x-slow opacity-40" viewBox="0 0 1440 200" preserveAspectRatio="none" style={{ height: "30%" }}>
        <path d="M0 120 C180 80 360 70 540 100 C720 130 900 160 1080 140 C1260 120 1380 90 1440 100 L1440 200 L0 200 Z M1440 120 C1620 80 1800 70 1980 100 C2160 130 2340 160 2520 140 C2700 120 2820 90 2880 100 L2880 200 L1440 200 Z" fill="#0D2137" />
      </svg>
      <svg className="absolute bottom-0 left-0 w-[200%] animate-wave-x opacity-70" viewBox="0 0 1440 180" preserveAspectRatio="none" style={{ height: "24%" }}>
        <path d="M0 110 C200 70 400 60 600 90 C800 120 1000 150 1200 130 C1330 118 1400 100 1440 105 L1440 180 L0 180 Z M1440 110 C1640 70 1840 60 2040 90 C2240 120 2440 150 2640 130 C2770 118 2840 100 2880 105 L2880 180 L1440 180 Z" fill="#132E4A" fillOpacity="0.8" />
      </svg>
    </div>
  );
}

export function Hero() {
  const { scrollTo } = useLenis();
  const lite = useLiteMode();
  const [introDone, setIntroDone] = useState(false);
  const [typed, startTyped] = useState(false);
  const text = useTypewriter(TAGLINE, typed);

  // scroll interaction: hero content sinks + blurs as you dive past it
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);
  const contentBlur = useTransform(scrollYProgress, [0, 0.8], ["blur(0px)", "blur(10px)"]);
  const indicatorOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  useEffect(() => {
    const t1 = setTimeout(() => setIntroDone(true), 2600);
    const t2 = setTimeout(() => startTyped(true), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const typingDone = text.length === TAGLINE.length;

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden"
    >
      {/* Abyss gradient base (also what the 3D fades into) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, #0A1628 0%, #0C1D33 45%, #0D2137 75%, #132E4A 100%)" }}
      />

      {lite ? <LiteOcean /> : <OceanScene />}

      {/* vignette + top gradient for legibility */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(10,22,40,0.55)_100%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-abyssal-navy/80 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-abyssal-navy via-abyssal-navy/40 to-transparent" />

      {/* Click anywhere to send a sonar pulse and fish up a reading */}
      <SonarPing />

      {/* ── Overlay content ── */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity, filter: contentBlur }}
        className="pointer-events-none relative z-10 flex flex-col items-center px-5 text-center"
      >
        {/* Logo with glitch-in */}
        <div className="pointer-events-auto relative mb-6 flex select-none flex-wrap justify-center overflow-visible">
          {LOGO.split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 46, rotateX: 80, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, rotateX: 0, filter: "blur(0px)" }}
              transition={{ delay: 1.15 + i * 0.055, duration: 0.75, ease: [0.2, 0.9, 0.25, 1] }}
              className={`h-display ${introDone ? "" : "hero-glitch"} ${
                i >= 5 ? "text-bio-cyan glow-text" : "text-foam"
              }`}
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              {ch}
            </motion.span>
          ))}
          {/* orbits */}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 1 }}
            aria-hidden
            className="absolute -inset-x-10 -inset-y-6 -z-10 rounded-full bg-bio-cyan/10 blur-3xl animate-glow-pulse"
          />
        </div>

        {/* Typed tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.3, duration: 0.6 }}
          className="pointer-events-auto flex min-h-[2.4rem] items-center justify-center"
        >
          <p
            className={`font-display text-xl font-semibold tracking-wide text-silver md:text-2xl ${
              typingDone ? "glow-text" : ""
            }`}
            style={typingDone ? { color: "#F0F7FF" } : undefined}
          >
            {text}
            <span className={`ml-1 inline-block h-6 w-[2px] translate-y-1 bg-bio-cyan ${typingDone ? "animate-blink" : "animate-caret"}`} />
          </p>
        </motion.div>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
          animate={typingDone ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          className="pointer-events-auto mt-4 max-w-xl font-mono text-[11px] uppercase tracking-[0.35em] text-electric-teal/90 md:text-xs"
        >
          AI-Powered Ocean Anomaly Detection Platform
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={typingDone ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.25, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
          className="pointer-events-auto mt-10 flex flex-col items-center gap-4 sm:flex-row"
        >
          <MagneticButton>
            <RippleButton variant="primary" onClick={() => scrollTo("#launch")}>
              <Radar className="h-4.5 w-4.5 h-5 w-5" />
              Launch Model
            </RippleButton>
          </MagneticButton>
          <MagneticButton>
            <RippleButton variant="ghost" onClick={() => scrollTo("#pipeline")}>
              <Telescope className="h-4.5 w-4.5 h-5 w-5" />
              Explore the Mission
            </RippleButton>
          </MagneticButton>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        style={{ opacity: indicatorOpacity }}
        className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2"
      >
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4, duration: 1 }}
        onClick={() => scrollTo("#pipeline")}
        className="flex flex-col items-center gap-1.5"
        aria-label="Scroll to next section"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-silver/70">
          Dive Deeper
        </span>
        <motion.span
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-5 w-5 text-bio-cyan" />
        </motion.span>
      </motion.button>
      </motion.div>

      <style jsx>{`
        .hero-glitch {
          animation: hero-glitch 0.5s steps(2) 3;
        }
        @keyframes hero-glitch {
          0% {
            text-shadow: 2px 0 rgba(255, 107, 107, 0.8), -2px 0 rgba(0, 187, 249, 0.8);
            transform: translateX(0.5px);
          }
          50% {
            text-shadow: -2px 0 rgba(255, 107, 107, 0.8), 2px 0 rgba(0, 245, 212, 0.8);
            transform: translateX(-0.5px);
          }
          100% {
            text-shadow: none;
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}
