"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Satellite, Waves, Activity, RefreshCcw, Radio, MapPin } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

const Globe = dynamic(() => import("@/three/Globe"), { ssr: false });

type OceanData = {
  updatedAt: string;
  pace: {
    source: string;
    live: boolean;
    granules: { id: string; title: string; timeStart: string; timeEnd: string; bbox: string | null }[];
  };
  noaa: {
    source: string;
    live: boolean;
    avgWaterTempC: number | null;
    stations: { station: string; name: string; lat: number; lon: number; waterTempC: number | null; time: string }[];
  };
  hab: { source: string; note: string };
};

function fmtTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
        live
          ? "border-bio-cyan/40 bg-bio-cyan/10 text-bio-cyan"
          : "border-solar/40 bg-solar/10 text-solar"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-bio-cyan animate-pulse" : "bg-solar"}`} />
      {live ? "live" : "cached"}
    </span>
  );
}

export function PoweredByInnovation() {
  const [data, setData] = useState<OceanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStation, setActiveStation] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/ocean-data", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: OceanData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section id="innovation" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-50" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-10 h-[30rem] w-[46rem] -translate-x-1/2 rounded-full bg-plankton/8 blur-[150px]" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 02 — Live Sources
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section max-w-3xl text-foam">
            Powered by <span className="text-gradient">Innovation</span>
          </h2>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-silver/70">
            OCEANNOVA rides on public Earth-observation infrastructure — NASA&apos;s
            PACE ocean-color mission and NOAA&apos;s ocean network. The feeds below are
            pulled live, server-side, from those agencies.
          </p>
        </Reveal>

        <div className="mt-14 grid items-center gap-8 lg:grid-cols-2">
          {/* Globe */}
          <Reveal delay={0.1}>
            <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
              <Globe />
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,transparent_55%,rgba(10,22,40,0.6)_100%)]" />
            </div>
          </Reveal>

          {/* Live feeds */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-silver/50">
                {data ? `Updated ${fmtTime(data.updatedAt)}` : "Connecting to sources…"}
              </span>
              <button
                onClick={load}
                className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-silver/70 transition hover:border-bio-cyan/50 hover:text-bio-cyan"
              >
                <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            {/* NASA PACE card */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="glass rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-bio-cyan/40 bg-abyssal-navy/60">
                    <Satellite className="h-4.5 w-4.5 text-bio-cyan" />
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foam">NASA PACE — OCI L2</h3>
                    <p className="font-mono text-[10px] text-silver/50">Earthdata CMR granule feed</p>
                  </div>
                </div>
                {data && <LiveBadge live={data.pace.live} />}
              </div>
              <div className="space-y-1.5">
                {loading && !data
                  ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-8 w-full rounded-lg" />)
                  : data?.pace.granules.slice(0, 3).map((g) => (
                      <div key={g.id} className="rounded-lg border border-white/5 bg-abyssal-navy/50 px-3 py-2">
                        <p className="truncate font-mono text-[11px] text-foam">{g.title}</p>
                        <p className="font-mono text-[10px] text-silver/50">{fmtTime(g.timeStart)} {g.bbox ? `· bbox ${g.bbox}` : ""}</p>
                      </div>
                    ))}
              </div>
            </motion.div>

            {/* NOAA card */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }} className="glass rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-electric-teal/40 bg-abyssal-navy/60">
                    <Waves className="h-4.5 w-4.5 text-electric-teal" />
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foam">NOAA — Sea-surface network</h3>
                    <p className="font-mono text-[10px] text-silver/50">CO-OPS water temperature</p>
                  </div>
                </div>
                {data && <LiveBadge live={data.noaa.live} />}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {loading && !data
                  ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-14 w-full rounded-lg" />)
                  : data?.noaa.stations.slice(0, 3).map((s) => {
                      const isActive = activeStation === s.station;
                      return (
                        <button
                          key={s.station}
                          type="button"
                          data-cursor="hover"
                          onClick={() => setActiveStation((cur) => (cur === s.station ? null : s.station))}
                          aria-expanded={isActive}
                          className={`rounded-lg border px-3 py-2 text-center transition-all duration-300 ${
                            isActive
                              ? "border-electric-teal/60 bg-electric-teal/10"
                              : "border-white/5 bg-abyssal-navy/50 hover:border-electric-teal/30 hover:bg-abyssal-navy/70"
                          }`}
                        >
                          <p className="font-display text-lg font-bold text-electric-teal">
                            {s.waterTempC != null ? `${s.waterTempC.toFixed(1)}°` : "—"}
                          </p>
                          <p className="truncate font-mono text-[9px] text-silver/55">{s.name}</p>
                        </button>
                      );
                    })}
              </div>
              <AnimatePresence>
                {activeStation && data && (() => {
                  const s = data.noaa.stations.find((st) => st.station === activeStation);
                  if (!s) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 rounded-lg border border-electric-teal/20 bg-abyssal-navy/60 px-3 py-2.5 font-mono text-[10px] text-silver/70">
                        <MapPin className="h-3 w-3 shrink-0 text-electric-teal" />
                        <span className="truncate">
                          Station {s.station} · {s.lat.toFixed(2)}°, {s.lon.toFixed(2)}° · read {fmtTime(s.time)}
                        </span>
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
              {data?.noaa.avgWaterTempC != null && (
                <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-silver/55">
                  <Activity className="h-3 w-3 text-electric-teal" />
                  Mean SST across stations: <span className="text-foam">{data.noaa.avgWaterTempC}°C</span>
                </p>
              )}
            </motion.div>

            {/* HAB note */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }} className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-coral/40 bg-abyssal-navy/60">
                  <Radio className="h-4.5 w-4.5 text-coral" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-foam">NOAA NCCOS — HAB bulletins</h3>
                  <p className="font-mono text-[10px] text-silver/50">Cross-checked against PACE chlorophyll anomalies</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
