"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Hero } from "@/sections/Hero";
import { WaveDivider } from "@/components/WaveDivider";

/* Code-split + render-deferred below-fold sections */
const RawDataInsight = dynamic(() => import("@/sections/RawDataInsight").then((m) => m.RawDataInsight));
const StatsWave = dynamic(() => import("@/sections/StatsWave").then((m) => m.StatsWave));
const PoweredByInnovation = dynamic(() => import("@/sections/PoweredByInnovation").then((m) => m.PoweredByInnovation));
const LaunchModel = dynamic(() => import("@/sections/LaunchModel").then((m) => m.LaunchModel));
const Footer = dynamic(() => import("@/sections/Footer").then((m) => m.Footer));

/** Broadcast this to force every below-fold section to mount immediately,
 *  e.g. right before scrolling to an anchor that lives inside a Lazy section. */
export const FORCE_REVEAL_EVENT = "oceannova:reveal-lazy-sections";

export function forceRevealLazySections() {
  window.dispatchEvent(new Event(FORCE_REVEAL_EVENT));
}

/** Mounts children (triggering their chunk fetch) only when near viewport. */
function Lazy({ children, minHeight = 480 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);

    const reveal = () => setShow(true);
    window.addEventListener(FORCE_REVEAL_EVENT, reveal);

    return () => {
      io.disconnect();
      window.removeEventListener(FORCE_REVEAL_EVENT, reveal);
    };
  }, []);

  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? children : <div className="shimmer mx-auto my-24 h-40 max-w-4xl rounded-3xl opacity-40" />}
    </div>
  );
}

export function ClientSections() {
  return (
    <main className="relative z-[2]">
      <Hero />
      <WaveDivider topColor="transparent" bottomColor="rgba(0,187,249,0.10)" className="-mt-px" />
      <Lazy minHeight={800}>
        <RawDataInsight />
      </Lazy>
      <WaveDivider flip topColor="transparent" bottomColor="rgba(123,97,255,0.10)" />
      <Lazy minHeight={220}>
        <StatsWave />
      </Lazy>
      <Lazy minHeight={900}>
        <PoweredByInnovation />
      </Lazy>
      <WaveDivider topColor="transparent" bottomColor="rgba(0,245,212,0.10)" className="rotate-180" />
      <Lazy minHeight={600}>
        <LaunchModel />
      </Lazy>
      <Lazy minHeight={420}>
        <Footer />
      </Lazy>
    </main>
  );
}
