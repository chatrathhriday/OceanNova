"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useSound } from "@/components/SoundEngine";

const MESSAGES = [
  "148 buoys are listening right now. Somewhere out there, one just felt something strange.",
  "Fun fact: the deepest point OCEANNOVA tracks is deeper than 20 Eiffel Towers stacked end to end.",
  "You found the message in the bottle. The ocean says thank you for paying attention.",
  "Every ripple on this page is procedurally generated — nothing is looping, nothing repeats twice.",
  "If sound is on, every splash you just heard was synthesized live in your browser, not a recording.",
];

/** A fixed drifting bottle — click it to fish out a random message from the deep. */
export function MessageBottle() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(MESSAGES[0]);
  const { playSplash } = useSound();

  const fish = () => {
    setMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
    setOpen(true);
    playSplash();
  };

  return (
    <>
      <motion.button
        onClick={fish}
        data-cursor="hover"
        aria-label="Fish out a message in a bottle"
        className="fixed bottom-6 left-5 z-[110] flex h-14 w-14 items-center justify-center rounded-full border border-plankton/30 bg-deep-ocean/70 backdrop-blur-md md:bottom-8 md:left-8"
        animate={{ y: [0, -6, 0, 4, 0], rotate: [0, -4, 0, 3, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.08 }}
      >
        <span className="absolute inset-0 rounded-full bg-plankton/10 blur-md" />
        <svg viewBox="0 0 24 24" className="relative h-6 w-6 text-plankton" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10 2h4v3.2c0 .6.3 1.1.8 1.5A5 5 0 0 1 17 10.5V19a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-8.5c0-1.7.8-3.3 2.2-4.3.5-.4.8-.9.8-1.5V2Z" />
          <path d="M9 12.5c1 .7 2 .7 3 0s2-.7 3 0" />
          <path d="M10 2h4" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-abyssal-navy/80 backdrop-blur-sm px-6"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="glass relative max-w-md rounded-3xl border border-plankton/25 p-8 text-center"
              style={{ boxShadow: "0 0 60px -12px rgba(190,242,100,0.25)" }}
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-silver/70 transition hover:text-foam"
              >
                <X className="h-4 w-4" />
              </button>
              <Sparkles className="mx-auto mb-4 h-6 w-6 text-plankton" />
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-plankton">Message in a bottle</p>
              <p className="mt-4 text-base leading-relaxed text-foam">{message}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
