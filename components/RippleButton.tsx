"use client";

import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Ripple = { id: number; x: number; y: number; size: number };

export function RippleButton({
  children,
  className = "",
  variant = "primary",
  onClick,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const ref = useRef<HTMLButtonElement>(null);

  const spawn = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const size = Math.max(rect.width, rect.height) * 2.2;
    const id = Date.now() + Math.random();
    setRipples((r) => [
      ...r.slice(-3),
      { id, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size },
    ]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 750);
    onClick?.(e);
  };

  const base =
    "group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full font-display font-semibold tracking-wide transition-all duration-300 active:scale-[0.97]";
  const styles =
    variant === "primary"
      ? "bg-bio-cyan px-7 py-3.5 text-abyssal-navy shadow-[0_0_30px_-6px_rgba(0,245,212,0.65),0_14px_40px_-14px_rgba(0,245,212,0.5)] hover:shadow-[0_0_46px_-4px_rgba(0,245,212,0.9),0_18px_50px_-12px_rgba(0,245,212,0.6)] hover:-translate-y-0.5"
      : "border border-bio-cyan/40 px-7 py-3.5 text-bio-cyan backdrop-blur-sm hover:border-bio-cyan/80 hover:bg-bio-cyan/5 hover:shadow-[0_0_36px_-8px_rgba(0,245,212,0.5)] hover:-translate-y-0.5";

  return (
    <button ref={ref} onClick={spawn} className={`${base} ${styles} ${className}`} {...rest}>
      {/* water ripple rings */}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            border: variant === "primary" ? "2px solid rgba(10,22,40,0.35)" : "2px solid rgba(0,245,212,0.5)",
            animation: "btn-ripple 0.75s cubic-bezier(0.2,0.6,0.3,1) forwards",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes btn-ripple {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
      {/* sheen sweep */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
      <span className="relative z-10 inline-flex items-center gap-2.5">{children}</span>
    </button>
  );
}
