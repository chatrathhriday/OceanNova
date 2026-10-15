"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useSound } from "@/components/SoundEngine";

type WaterMark = {
  id: number;
  x: number;
  y: number;
  radius: number;
  life: number;
  speed: number;
  tilt: number;
  drift: number;
  kind: "ripple" | "bubble";
};

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [visible, setVisible] = useState(false);
  const marksRef = useRef<WaterMark[]>([]);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const { playTick, playSplash } = useSound();

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 420, damping: 38, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 420, damping: 38, mass: 0.6 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastMark = useRef({ x: -100, y: -100, time: 0 });
  const scrollRatio = useRef(0);
  const idRef = useRef(0);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    setEnabled(true);

    const addMark = (clientX: number, clientY: number, force = false) => {
      const now = performance.now();
      const dx = clientX - lastMark.current.x;
      const dy = clientY - lastMark.current.y;
      const distance = Math.hypot(dx, dy);
      if (!force && (distance < 30 || now - lastMark.current.time < 72)) return;
      lastMark.current = { x: clientX, y: clientY, time: now };
      const lowerScreen = scrollRatio.current > 0.42;
      marksRef.current = [
        ...marksRef.current.slice(-(lowerScreen ? 22 : 10)),
        {
          id: idRef.current++,
          x: clientX,
          y: clientY,
          radius: force ? 8 : lowerScreen ? 2 + Math.random() * 3 : 5 + Math.random() * 4,
          life: 1,
          speed: lowerScreen ? 0.4 + Math.random() * 0.5 : 0.8 + Math.random() * 0.7,
          tilt: Math.atan2(dy, dx),
          drift: (Math.random() - 0.5) * 0.35,
          kind: lowerScreen ? "bubble" : "ripple",
        },
      ];
    };

    const onMove = (event: PointerEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
      setVisible(true);
      const dx = event.clientX - lastMark.current.x;
      const dy = event.clientY - lastMark.current.y;
      const moved = Math.hypot(dx, dy);
      addMark(event.clientX, event.clientY);
      if (moved > 30) playTick();
      trailRef.current = [...trailRef.current.slice(-16), { x: event.clientX, y: event.clientY }];
      const target = event.target as HTMLElement | null;
      setHovering(Boolean(target?.closest("a, button, [role='button'], input, textarea, label, [data-cursor='hover']")));
    };
    const onDown = (event: PointerEvent) => {
      setPressed(true);
      addMark(event.clientX, event.clientY, true);
      playSplash();
    };
    const onUp = () => setPressed(false);
    const onLeave = () => setVisible(false);
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollRatio.current = max > 0 ? window.scrollY / max : 0;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    onScroll();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [x, y]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    const dpr = Math.min(window.devicePixelRatio, 1.6);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const trail = trailRef.current;
      if (trail.length > 2) {
        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        for (let seg = 1; seg < trail.length; seg++) {
          const a = trail[seg - 1];
          const b = trail[seg];
          const t = seg / trail.length;
          const wobble = Math.sin(t * Math.PI * 3 + performance.now() / 260) * 3.2 * t;
          const nx = -(b.y - a.y);
          const ny = b.x - a.x;
          const len = Math.hypot(nx, ny) || 1;
          const ox = (nx / len) * wobble;
          const oy = (ny / len) * wobble;
          context.beginPath();
          context.moveTo(a.x + ox, a.y + oy);
          context.lineTo(b.x + ox, b.y + oy);
          context.strokeStyle = `rgba(127, 205, 255, ${0.32 * t})`;
          context.lineWidth = 2.4 * t;
          context.shadowColor = "rgba(29, 162, 216, 0.4)";
          context.shadowBlur = 6;
          context.stroke();
        }
        context.restore();
      }

      marksRef.current = marksRef.current.filter((mark) => mark.life > 0.025);
      for (const mark of marksRef.current) {
        mark.life *= mark.kind === "ripple" ? 0.965 : 0.978;
        mark.radius += mark.speed;
        mark.x += mark.drift;
        const alpha = mark.life * (mark.kind === "ripple" ? 0.38 : 0.24);
        context.save();
        context.translate(mark.x, mark.y);
        context.rotate(mark.tilt);
        context.scale(1, mark.kind === "ripple" ? 0.46 : 0.9);
        context.beginPath();
        context.arc(0, 0, mark.radius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(127, 205, 255, ${alpha})`;
        context.lineWidth = mark.kind === "ripple" ? 1.15 : 1;
        context.shadowColor = `rgba(29, 162, 216, ${alpha})`;
        context.shadowBlur = mark.kind === "ripple" ? 10 : 5;
        context.stroke();
        if (mark.kind === "ripple" && mark.radius > 10) {
          context.beginPath();
          context.arc(0, 0, mark.radius * 0.68, 0, Math.PI * 2);
          context.strokeStyle = `rgba(222, 243, 246, ${alpha * 0.42})`;
          context.lineWidth = 0.7;
          context.stroke();
        }
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[300]" aria-hidden />
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[302] rounded-full"
        style={{ x: springX, y: springY, translateX: "-50%", translateY: "-50%" }}
        animate={{
          width: hovering ? 62 : 38,
          height: hovering ? 62 : 38,
          opacity: visible ? (hovering ? 0.9 : 0.62) : 0,
          scale: pressed ? 0.76 : 1,
        }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        aria-hidden
      >
        <div className="h-full w-full rounded-full border border-phantom-aqua/60" style={{ boxShadow: "0 0 22px rgba(127,205,255,0.3), inset 0 0 14px rgba(222,243,246,0.14)" }} />
      </motion.div>
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[303] rounded-full bg-bio-cyan"
        style={{ x, y, translateX: "-50%", translateY: "-50%", boxShadow: "0 0 14px rgba(29,162,216,0.95), 0 0 32px rgba(127,205,255,0.5)" }}
        animate={{ width: hovering ? 14 : 8, height: hovering ? 14 : 8, opacity: visible ? 1 : 0, scale: pressed ? 1.55 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        aria-hidden
      />
    </>
  );
}
