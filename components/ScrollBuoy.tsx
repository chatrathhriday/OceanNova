"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useLenis } from "@/components/LenisProvider";
import { useSound } from "@/components/SoundEngine";

/** A bobbing buoy that surfaces once you've scrolled past the hero, and carries you back to shore. */
export function ScrollBuoy() {
  const { scrollTo } = useLenis();
  const { playSplash } = useSound();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, scale: 0.4, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.4, y: 40 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          onClick={() => {
            playSplash();
            scrollTo(0);
          }}
          data-cursor="hover"
          aria-label="Back to the surface"
          className="group fixed bottom-6 right-5 z-[110] flex h-14 w-14 items-center justify-center rounded-full border border-bio-cyan/40 bg-deep-ocean/80 backdrop-blur-md shadow-[0_10px_34px_-10px_rgba(0,245,212,0.5)] md:bottom-8 md:right-8"
        >
          <motion.span
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-1.5 rounded-full border border-bio-cyan/25"
          />
          <span className="absolute inset-0 rounded-full ring-1 ring-bio-cyan/0 transition-all duration-300 group-hover:ring-bio-cyan/60 group-hover:shadow-[0_0_26px_-2px_rgba(0,245,212,0.7)]" />
          <ArrowUp className="relative h-5 w-5 text-bio-cyan transition-transform duration-300 group-hover:-translate-y-0.5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
