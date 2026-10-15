"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide deep-ocean plankton / particle field.
 * Subtle: low opacity, slow drift, occasional bioluminescent pulse.
 */
export function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf = 0;
    let w = 0;
    let h = 0;

    type P = {
      x: number; y: number; r: number;
      vx: number; vy: number;
      hue: number; pulse: number; phase: number;
    };
    let parts: P[] = [];
    const particleColors = [
      (alpha: number) => `rgba(29, 162, 216, ${alpha})`,
      (alpha: number) => `rgba(118, 182, 196, ${alpha})`,
      (alpha: number) => `rgba(127, 205, 255, ${alpha})`,
    ];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(110, Math.floor((w * h) / 16000));
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.7 + 0.4,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -Math.random() * 0.16 - 0.02,
        hue: Math.random(),
        pulse: 0,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx + Math.sin(t / 2400 + p.phase) * 0.05;
        p.y += p.vy;
        if (p.y < -8) { p.y = h + 8; p.x = Math.random() * w; }
        if (p.x < -8) p.x = w + 8;
        if (p.x > w + 8) p.x = -8;
        // rare bioluminescent pulse
        if (p.pulse <= 0 && Math.random() < 0.0006) p.pulse = 1;
        if (p.pulse > 0) p.pulse -= 0.012;
        const flicker = 0.5 + 0.5 * Math.sin(t / 900 + p.phase * 3);
        const baseA = 0.1 + flicker * 0.12;
        const a = Math.min(1, baseA + p.pulse * 0.75);
        const color = particleColors[p.hue < 0.6 ? 0 : p.hue < 0.85 ? 1 : 2](a);
        ctx.beginPath();
        const rad = p.r * (1 + p.pulse * 2.4);
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        if (p.pulse > 0.05) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 14 * p.pulse;
        }
        ctx.fillStyle = color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] opacity-[0.72]"
    />
  );
}
