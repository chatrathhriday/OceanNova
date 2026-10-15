"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "warning" | "info";
type Toast = { id: number; title: string; desc?: string; type: ToastType };

type ToastCtx = { push: (title: string, desc?: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(Ctx);

const CONFIG: Record<ToastType, { icon: typeof Info; ring: string; glow: string; chip: string }> = {
  success: {
    icon: CheckCircle2,
    ring: "border-bio-cyan/50",
    glow: "shadow-[0_0_36px_-6px_rgba(0,245,212,0.5)]",
    chip: "text-bio-cyan",
  },
  warning: {
    icon: AlertTriangle,
    ring: "border-coral/50",
    glow: "shadow-[0_0_36px_-6px_rgba(255,107,107,0.5)]",
    chip: "text-coral",
  },
  info: {
    icon: Info,
    ring: "border-electric-teal/50",
    glow: "shadow-[0_0_36px_-6px_rgba(0,187,249,0.5)]",
    chip: "text-electric-teal",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (title: string, desc?: string, type: ToastType = "info") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, title, desc, type }]);
      setTimeout(() => dismiss(id), 4600);
    },
    [dismiss]
  );

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-[150] flex w-[min(92vw,22rem)] flex-col gap-3">
        <AnimatePresence>
          {toasts.map((t) => {
            const c = CONFIG[t.type];
            const Icon = c.icon;
            return (
              <motion.div
                key={t.id}
                initial={{ x: 120, opacity: 0, scale: 0.9 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={{ x: 140, opacity: 0, scale: 0.92, filter: "blur(6px)" }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                className={`pointer-events-auto glass flex items-start gap-3 rounded-2xl border ${c.ring} ${c.glow} p-4`}
              >
                <div className="relative mt-0.5">
                  <Icon className={`h-5 w-5 ${c.chip}`} />
                  {/* bubble accent */}
                  <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full border border-bio-cyan/60 bg-bio-cyan/20 animate-bubble-wobble" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold text-foam">{t.title}</p>
                  {t.desc && <p className="mt-0.5 text-xs leading-relaxed text-silver/80">{t.desc}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="rounded-full p-1 text-silver/60 transition hover:bg-white/5 hover:text-foam"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
