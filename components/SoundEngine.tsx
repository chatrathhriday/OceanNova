"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type AmbienceRig = {
  ctx: AudioContext;
  gain: GainNode;
  nodes: AudioNode[];
};

type SoundContextValue = {
  enabled: boolean;
  toggle: () => void;
  playTick: () => void;
  playSplash: () => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

function getAudioCtor() {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const ambienceRef = useRef<AmbienceRig | null>(null);
  const sfxCtxRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef(0);

  const getSfxContext = useCallback(() => {
    if (!sfxCtxRef.current) {
      const AC = getAudioCtor();
      sfxCtxRef.current = new AC();
    }
    if (sfxCtxRef.current.state === "suspended") {
      sfxCtxRef.current.resume().catch(() => {});
    }
    return sfxCtxRef.current;
  }, []);

  const startAmbience = useCallback(() => {
    const AC = getAudioCtor();
    const ctx = new AC();
    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.4);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.09;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.23;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 160;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(filter.frequency);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    lfo.start();
    lfo2.start();
    ambienceRef.current = { ctx, gain, nodes: [src, filter, lfo, lfo2] };
  }, []);

  const stopAmbience = useCallback(() => {
    const rig = ambienceRef.current;
    if (!rig) return;
    rig.gain.gain.linearRampToValueAtTime(0, rig.ctx.currentTime + 0.6);
    setTimeout(() => rig.ctx.close(), 800);
    ambienceRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next) startAmbience();
      else stopAmbience();
      return next;
    });
  }, [startAmbience, stopAmbience]);

  const playTick = useCallback(() => {
    if (!enabled) return;
    const now = performance.now();
    if (now - lastTickRef.current < 120) return;
    lastTickRef.current = now;
    try {
      const ctx = getSfxContext();
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2400 + Math.random() * 900;
      filter.Q.value = 3;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + 0.07);
    } catch {
      // ignore audio failures silently
    }
  }, [enabled, getSfxContext]);

  const playSplash = useCallback(() => {
    if (!enabled) return;
    try {
      const ctx = getSfxContext();
      const len = Math.floor(ctx.sampleRate * 0.28);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.26);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + 0.32);
    } catch {
      // ignore audio failures silently
    }
  }, [enabled, getSfxContext]);

  const value = useMemo(
    () => ({ enabled, toggle, playTick, playSplash }),
    [enabled, toggle, playTick, playSplash]
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error("useSound must be used within a SoundProvider");
  }
  return ctx;
}
