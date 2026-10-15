"use client";

import { useEffect, useRef } from "react";
import { getScrollSignal } from "@/lib/scrollSignal";

/**
 * Interactive flowing-wave background for sections.
 *
 * Interactions:
 *  - cursor gravity: lines bend toward the pointer
 *  - pointer wake: moving spawns ripples, pressing fires a big splash ring
 *  - scroll surge: scroll velocity shears, boosts and turbulates the waves
 *  - scroll wake: fast scrolling drops ripple rings across the field
 *  - scroll parallax: each line drifts at its own depth as the section passes
 */
const LINE_CFG = [
  { y: 0.18, amp: 13, fq: 0.0042, sp: 0.55, depth: 26 },
  { y: 0.38, amp: 19, fq: 0.0032, sp: -0.4, depth: 46 },
  { y: 0.56, amp: 15, fq: 0.005, sp: 0.33, depth: 18 },
  { y: 0.72, amp: 23, fq: 0.0028, sp: -0.5, depth: 62 },
  { y: 0.88, amp: 17, fq: 0.0037, sp: 0.44, depth: 34 },
];

const COLORS: [string, number][] = [
  ["0,245,212", 0.5],
  ["0,187,249", 0.42],
  ["123,97,255", 0.34],
  ["0,229,204", 0.3],
  ["0,187,249", 0.26],
];

type Ripple = { x: number; y: number; age: number; pow: number };

export function WaveField({
  className = "",
  intensity = 1,
}: {
  className?: string;
  intensity?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scroll = getScrollSignal();

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = false;
    let t = Math.random() * 100;
    let last = performance.now();
    let lastSpawn = 0;
    let lastScrollSpawn = 0;

    // smoothed scroll reactions
    let surge = 0; // |velocity| -> amplitude boost
    let shear = 0; // signed velocity -> horizontal lean
    let sectionProg = 0.5; // 0..1 as the section crosses the viewport

    const ripples: Ripple[] = [];
    const pointer = { x: -9999, y: -9999, active: false, str: 0 };

    const resize = () => {
      const r = parent.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const d = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.max(1, w * d);
      canvas.height = Math.max(1, h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
      },
      { rootMargin: "180px 0px" }
    );
    io.observe(parent);

    const spawn = (x: number, y: number, pow: number) => {
      ripples.push({ x, y, age: 0, pow });
      if (ripples.length > 18) ripples.shift();
    };

    const onMove = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = pointer.y >= -40 && pointer.y <= r.height + 40;
      const now = performance.now();
      if (pointer.active && now - lastSpawn > 110) {
        lastSpawn = now;
        spawn(pointer.x, pointer.y, 0.55);
      }
    };
    const onLeave = () => {
      pointer.active = false;
    };
    const onDown = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      spawn(x, y, 2.1);
      // secondary echo ring for a proper splash
      setTimeout(() => spawn(x, y, 1.1), 110);
    };
    parent.addEventListener("pointermove", onMove, { passive: true });
    parent.addEventListener("pointerleave", onLeave, { passive: true });
    parent.addEventListener("pointerdown", onDown, { passive: true });

    const dispAt = (x: number, baseY: number, i: number) => {
      const cfg = LINE_CFG[i];
      // scroll shear leans the wave phase, surge inflates amplitude
      const amp = cfg.amp * (1 + surge * 1.5);
      const px = x + shear * (30 + i * 14);

      let y =
        Math.sin(px * cfg.fq + t * cfg.sp + i * 1.7) * amp +
        Math.sin(px * cfg.fq * 2.6 + t * cfg.sp * 1.6 + i) * amp * 0.35 +
        // turbulence only shows up while moving
        Math.sin(px * cfg.fq * 5.5 - t * 2.2 + i) * amp * 0.5 * surge;

      // cursor gravity
      if (pointer.active) {
        const dx = x - pointer.x;
        y +=
          (pointer.y - baseY) *
          Math.exp(-(dx * dx) / (2 * 190 * 190)) *
          0.3 *
          pointer.str;
      }

      // ripple rings
      for (const r of ripples) {
        const d = Math.hypot(x - r.x, baseY - r.y);
        y +=
          Math.sin(d * 0.05 - r.age * 6.5) *
          Math.exp(-d * 0.0065) *
          Math.exp(-r.age * 1.05) *
          r.pow *
          32;
      }
      return y * intensity;
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < LINE_CFG.length; i++) {
        const cfg = LINE_CFG[i];
        // scroll parallax: each line drifts at its own depth
        const baseY =
          h * cfg.y + (sectionProg - 0.5) * cfg.depth * intensity;
        const [rgb, a] = COLORS[i % COLORS.length];
        const boost = 1 + surge * 0.9;

        for (const pass of [0, 1]) {
          ctx.beginPath();
          for (let x = -24; x <= w + 24; x += 8) {
            const y = baseY + dispAt(x, baseY, i);
            if (x === -24) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle =
            pass === 0
              ? `rgba(${rgb},${a * 0.16 * boost})`
              : `rgba(${rgb},${Math.min(0.85, a * boost)})`;
          ctx.lineWidth = pass === 0 ? 7 : 1.4;
          ctx.stroke();
        }
      }

      // crest glints where the pointer bends the water
      if (pointer.active && pointer.str > 0.15) {
        const g = ctx.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          150
        );
        g.addColorStop(0, `rgba(0,245,212,${0.1 * pointer.str})`);
        g.addColorStop(1, "rgba(0,245,212,0)");
        ctx.fillStyle = g;
        ctx.fillRect(pointer.x - 150, pointer.y - 150, 300, 300);
      }

      // soft wave silhouettes along the bottom
      for (let s = 0; s < 2; s++) {
        ctx.beginPath();
        const by = h * (0.93 + s * 0.05) + (sectionProg - 0.5) * 30;
        for (let x = -24; x <= w + 24; x += 12) {
          const y =
            by +
            Math.sin(
              (x + shear * 40) * 0.004 + t * (0.3 + s * 0.15) + s * 2
            ) *
              (16 + s * 10) *
              (1 + surge) *
              intensity;
          if (x === -24) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(w + 24, h + 24);
        ctx.lineTo(-24, h + 24);
        ctx.closePath();
        ctx.fillStyle = s === 0 ? "rgba(19,46,74,0.15)" : "rgba(13,33,55,0.26)";
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;

      // ── scroll reactions ──
      const v = scroll.velocity;
      const targetSurge = Math.min(1, Math.abs(v) / 42);
      surge += (targetSurge - surge) * Math.min(1, dt * 5);
      shear += (Math.max(-1, Math.min(1, v / 45)) - shear) * Math.min(1, dt * 5);

      const rect = parent.getBoundingClientRect();
      const raw =
        (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
      sectionProg = Math.min(1, Math.max(0, raw));

      // fast scrolling drops wake rings into the field
      if (Math.abs(v) > 16 && now - lastScrollSpawn > 190) {
        lastScrollSpawn = now;
        spawn(
          Math.random() * w,
          v > 0 ? rect.height * (0.75 + Math.random() * 0.3) : rect.height * Math.random() * 0.3,
          Math.min(1.3, Math.abs(v) / 55)
        );
      }

      // pointer influence eases in/out instead of snapping
      pointer.str += ((pointer.active ? 1 : 0) - pointer.str) * Math.min(1, dt * 4);

      t += dt * (1 + surge * 1.6); // waves speed up with scroll
      for (const r of ripples) r.age += dt;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (ripples[i].age > 3.2) ripples.splice(i, 1);
      }
      draw();
    };

    if (reduced) {
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
      parent.removeEventListener("pointerdown", onDown);
    };
  }, [intensity]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
    />
  );
}
