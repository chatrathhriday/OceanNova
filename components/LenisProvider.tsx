"use client";

import Lenis from "lenis";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

type LenisCtx = { scrollTo: (target: string | number) => void };

const Ctx = createContext<LenisCtx>({ scrollTo: () => {} });

export const useLenis = () => useContext(Ctx);

export function LenisProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      duration: 1.25,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    lenisRef.current = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const runScroll = (target: string | number) => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, { offset: -70, duration: 1.6 });
    } else if (typeof target === "string") {
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: target, behavior: "smooth" });
    }
  };

  const scrollTo = (target: string | number) => {
    // Anchor targets can live inside sections that only mount (and finish
    // fetching their code-split chunk) once scrolled near. Force them to
    // mount first, then poll until the element actually lands in the DOM
    // before measuring the scroll offset.
    if (typeof target === "string" && !document.querySelector(target)) {
      window.dispatchEvent(new Event("oceannova:reveal-lazy-sections"));
      const start = Date.now();
      const poll = () => {
        if (document.querySelector(target) || Date.now() - start > 4000) {
          runScroll(target);
        } else {
          setTimeout(poll, 60);
        }
      };
      poll();
      return;
    }
    runScroll(target);
  };

  return <Ctx.Provider value={{ scrollTo }}>{children}</Ctx.Provider>;
}
