"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import useSWR from "swr";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { Crosshair, Layers3, Minus, Plus, RotateCcw, MapPin, Radar, TrendingUp, TrendingDown, Minus as MinusIcon, Satellite, Anchor, Telescope, Wifi, BrainCircuit, DatabaseZap } from "lucide-react";
import {
  METRIC_META,
  getCriticalAnomalies,
  hydrateAnomaly,
  statusColor,
  statusLabel,
  type CriticalAnomaly,
  type SerializedAnomaly,
} from "@/lib/region-metrics";
import { isPointOnLand, loadLandFeatures } from "@/lib/land-mask";
import { AnomalyReportPanel } from "./AnomalyReportPanel";
import { ForecastAreas, ForecastPins } from "./ForecastLayer";
import { ForecastPanel, sortZones, type ZoneSort } from "./ForecastPanel";
import { CAUSE_COLORS, SIGNAL_LABEL, causeColor, causeLabel, causePlain, formatCoord, zoneName, type Forecast, type ForecastZone } from "./forecast";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
// Finer coastlines, loaded only once the map is zoomed in far enough for the coarse ones to
// misplace the shore by more than a forecast zone is wide.
const GEO_URL_DETAIL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
const DETAIL_ZOOM = 5;

type Granule = { id: string; title: string; timeStart: string; timeEnd: string; bbox: string | null };
type BuoyObs = { station: string; name: string; lat: number; lon: number; waterTempC: number | null; waveHeightM: number | null; time: string };
type OceanDataResponse = {
  updatedAt: string;
  pace: { source: string; live: boolean; granules: Granule[] };
  noaa: { source: string; live: boolean; stations: BuoyObs[]; avgWaterTempC: number | null };
};
type LiveAnomaliesResponse = {
  updatedAt: string;
  liveComputed: boolean;
  source: string;
  paceLive: boolean;
  noaaLive: boolean;
  anomalies: SerializedAnomaly[];
};

type RealPacePoint = {
  id: string;
  latitude: number;
  longitude: number;
  anomaly_score: number;
  confidence: number;
  severity: string;
  cause: string;
  noaa?: { station?: string | null; distance_km?: number | null; water_temp_c?: number | null; wave_height_m?: number | null };
};

type RealPaceResponse = {
  live: boolean;
  status?: string;
  message?: string;
  updated_at?: string;
  pace_granules?: number;
  candidate_pixels?: number;
  valid_coordinates?: number;
  anomaly_pixels?: number;
  map_points?: number;
  points: RealPacePoint[];
  forecast?: Forecast;
};

// Zoom limit. Forecast zones are tens of kilometres across, which is a few pixels on the
// world view, so the map has to zoom much further than the overview needs.
const MAX_ZOOM = 16;
function granuleCentroid(bbox: string | null): [number, number] | null {
  if (!bbox) return null;
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

async function fetchOceanData(): Promise<OceanDataResponse> {
  const res = await fetch("/api/ocean-data", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load live ocean data");
  return res.json();
}

async function fetchLiveAnomalies(): Promise<LiveAnomaliesResponse> {
  const res = await fetch("/api/live-anomalies", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load live anomaly analysis");
  return res.json();
}

async function fetchRealPace(): Promise<RealPaceResponse> {
  const res = await fetch("/api/real-anomalies", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load real PACE pixels");
  return res.json();
}
// One distinct color per tracked category (24 total) — spread across the hue wheel in
// families (thermal reds/oranges, chemical yellows/greens, geophysical browns/rust, plumes
// pink/violet, ice/pale blues, pollution grays) so the legend and map dots stay readable even
// with this many categories active at once.
const CATEGORY_COLORS: Record<string, string> = {
  sst: "#ff6b6b",
  salinity: "#ffd166",
  current: "#7b61ff",
  ph: "#00f5d4",
  oxygen: "#4cc9f0",
  chlorophyll: "#a7f432",
  hab: "#f72585",
  pressure: "#ff9f1c",
  seismic: "#b5651d",
  volcanic: "#ff4500",
  tsunami: "#2ec4b6",
  hydrothermal: "#ff8fa3",
  bioluminescence: "#caff70",
  methane: "#8d99ae",
  turbidity: "#c9a66b",
  icecalving: "#a8dadc",
  coralbleaching: "#ffb4a2",
  microplastic: "#adb5bd",
  noise: "#9d4edd",
  radiological: "#ccff00",
  oilspill: "#495057",
  windshear: "#48cae4",
  wavefreq: "#80ffdb",
  deepcurrent: "#3a86ff",
};

function markerColor(metricKey: string) {
  return CATEGORY_COLORS[metricKey] ?? "#b9d0dc";
}

function trendGlyph(trend: CriticalAnomaly["stats"]["trend"]) {
  return trend === "rising" ? TrendingUp : trend === "falling" ? TrendingDown : MinusIcon;
}

// Sibling markers sharing a region get spread out around it so they don't stack on top of
// each other, but a fixed offset can push a point that started safely at sea onto the
// nearby coastline (many tracked regions are narrow seas/gulfs hugged by land). Walk the
// offset back toward the guaranteed-ocean anchor point until it clears the landmass.
function jitterOnWater(
  anchor: [number, number],
  angle: number,
  spread: number,
  land: Awaited<ReturnType<typeof loadLandFeatures>> | undefined,
): [number, number] {
  if (spread === 0 || !land || land.length === 0) return anchor;
  for (const fraction of [1, 0.75, 0.5, 0.3, 0.15]) {
    const candidate: [number, number] = [
      anchor[0] + Math.cos(angle) * spread * fraction,
      anchor[1] + Math.sin(angle) * spread * fraction,
    ];
    if (!isPointOnLand(candidate[0], candidate[1], land)) return candidate;
  }
  return anchor;
}

export function AnomalyWorldMap() {
  const baselineAnomalies = useMemo(() => getCriticalAnomalies(), []);
  const { data: liveAnomalyData } = useSWR("live-anomalies-map", fetchLiveAnomalies, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
  });
  const { data: realPace } = useSWR("real-pace-pixels", fetchRealPace, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
  });

  // Real country-border geometry (the same topology drawn on the map itself), fetched once and
  // reused to strictly drop any anomaly, live-pixel, or forecast dot that falls on a landmass —
  // every one of these signals is derived from ocean sensing, so a land coordinate is never a
  // legitimate reading and gets filtered out rather than just visually relocated.
  const { data: landFeatures } = useSWR("world-land-mask", loadLandFeatures, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: Infinity,
  });

  const criticalAnomalies = useMemo(() => {
    const base = !liveAnomalyData ? baselineAnomalies : liveAnomalyData.anomalies.map(hydrateAnomaly);
    if (!landFeatures || landFeatures.length === 0) return base;
    return base.filter((a) => !isPointOnLand(a.coordinates[0], a.coordinates[1], landFeatures));
  }, [liveAnomalyData, baselineAnomalies, landFeatures]);

  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    () => new Set(METRIC_META.map((m) => m.key)),
  );
  const [position, setPosition] = useState({ coordinates: [0, 12] as [number, number], zoom: 1 });
  // The projection's trig results differ in the last float digit between Node and the browser,
  // so server-rendered marker transforms never match the client's. Draw the map after mount only.
  const [mapMounted, setMapMounted] = useState(false);
  useEffect(() => setMapMounted(true), []);
  const [showLabels, setShowLabels] = useState(true);
  const [showLive, setShowLive] = useState(true);
  // Forecast zones come from the ML service: patches of real flagged PACE pixels carried
  // forward with forecast ocean currents. The horizon index picks now / +24 h / +48 h / +72 h.
  const [showForecast, setShowForecast] = useState(false);
  const [horizonIndex, setHorizonIndex] = useState(1);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  // Hovering a zone card lights up its footprint and pin on the map, and the other way round.
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hiddenCauses, setHiddenCauses] = useState<Set<string>>(() => new Set());
  const [zoneSort, setZoneSort] = useState<ZoneSort>("strength");
  // Manual control over whether the info cards float above each dot. Off gives a clean
  // dots-only view (colored real anomalies, white forecast pointers); on restores the
  // always-visible cards, which get congested once many categories are active at once.
  const [showCards, setShowCards] = useState(true);
  const [openReport, setOpenReport] = useState<CriticalAnomaly | null>(null);

  const sectionRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<CriticalAnomaly | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [hoveredLive, setHoveredLive] = useState<
    | { kind: "pace" | "noaa"; label: string; detail: string }
    | { kind: "pace-pixel"; point: RealPacePoint }
    | null
  >(null);

  const realPacePoints = useMemo(() => {
    if (!realPace?.live) return [];
    const finite = realPace.points.filter(
      (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
    );
    // A satellite ocean-color/temperature pixel that resolves onto a landmass is a coastal
    // mixed-pixel artifact, not a real ocean reading — drop it rather than show it.
    const valid =
      landFeatures && landFeatures.length > 0
        ? finite.filter((point) => !isPointOnLand(point.longitude, point.latitude, landFeatures))
        : finite;
    // Each dot is a live SVG node; past a couple of thousand the map stops panning smoothly.
    // Thinning keeps an even sample, and the forecast footprints still cover every pixel.
    const displayLimit = 1500;
    if (valid.length <= displayLimit) return valid;
    return valid.filter((_, index) => index % Math.ceil(valid.length / displayLimit) === 0).slice(0, displayLimit);
  }, [realPace, landFeatures]);

  const { data: ocean } = useSWR("ocean-data-map", fetchOceanData, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
  });

  const paceMarkers = useMemo(() => {
    if (!ocean) return [];
    const withCentroids = ocean.pace.granules
      .map((g) => ({ granule: g, coords: granuleCentroid(g.bbox) }))
      .filter((g): g is { granule: Granule; coords: [number, number] } => g.coords !== null);
    // A satellite pass centroid that resolves onto a landmass isn't a meaningful ocean
    // observation point — drop it rather than show it, same as the anomaly/forecast dots.
    if (!landFeatures || landFeatures.length === 0) return withCentroids;
    return withCentroids.filter((g) => !isPointOnLand(g.coords[0], g.coords[1], landFeatures));
  }, [ocean, landFeatures]);

  const noaaBuoys = useMemo(() => {
    const stations = ocean?.noaa.stations ?? [];
    if (!landFeatures || landFeatures.length === 0) return stations;
    return stations.filter((buoy) => !isPointOnLand(buoy.lon, buoy.lat, landFeatures));
  }, [ocean, landFeatures]);

  const visibleAnomalies = useMemo(
    () => criticalAnomalies.filter((a) => activeCategories.has(a.metricKey)),
    [criticalAnomalies, activeCategories],
  );
  // Number every zone once, in the service's strength order, so a pin keeps its number
  // however the list is filtered or sorted.
  const forecast = useMemo(() => {
    const raw = realPace?.live ? realPace.forecast : undefined;
    return raw ? { ...raw, zones: raw.zones.map((zone, index) => ({ ...zone, rank: index + 1 })) } : undefined;
  }, [realPace]);
  const shownZones = useMemo(
    () => (forecast?.available ? sortZones(forecast.zones.filter((zone) => !hiddenCauses.has(zone.cause)), zoneSort) : []),
    [forecast, hiddenCauses, zoneSort],
  );
  const forecastOnMap = useMemo(
    () => (showForecast && forecast?.available && shownZones.length > 0 ? { ...forecast, zones: shownZones } : null),
    [showForecast, forecast, shownZones],
  );
  const horizonCount = forecast?.horizons_hours?.length ?? 4;

  // Play steps through now, +24 h, +48 h, +72 h and loops.
  useEffect(() => {
    if (!playing || !showForecast) return;
    const timer = window.setInterval(() => setHorizonIndex((index) => (index + 1) % horizonCount), 1700);
    return () => window.clearInterval(timer);
  }, [playing, showForecast, horizonCount]);

  const toggleCause = (cause: string) =>
    setHiddenCauses((previous) => {
      const next = new Set(previous);
      if (next.has(cause)) next.delete(cause);
      else next.add(cause);
      return next;
    });

  // Frame every shown zone at once. Zones on opposite sides of the world fall back to the full map.
  const fitAllZones = () => {
    setSelectedZoneId(null);
    if (shownZones.length === 0) return;
    const lons = shownZones.map((zone) => zone.centroid[0]);
    const lats = shownZones.map((zone) => zone.centroid[1]);
    const lonSpan = Math.max(...lons) - Math.min(...lons);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    if (lonSpan > 150) {
      setPosition({ coordinates: [0, 12], zoom: 1 });
      return;
    }
    const zoom = Math.min(MAX_ZOOM, Math.max(1, 300 / (Math.max(lonSpan, latSpan * 2) + 12)));
    setPosition({ coordinates: [(Math.max(...lons) + Math.min(...lons)) / 2, (Math.max(...lats) + Math.min(...lats)) / 2], zoom });
  };

  const hoveredZone = forecastOnMap?.zones.find((zone) => zone.id === hoveredZoneId) ?? null;

  const toggleCategory = (key: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isAllActive = activeCategories.size === METRIC_META.length;
  const setAll = () => setActiveCategories(new Set(METRIC_META.map((m) => m.key)));
  const setNone = () => setActiveCategories(new Set());

  const showTooltip = (anomaly: CriticalAnomaly, event: ReactMouseEvent) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = event.clientX - rect.left + 16;
    const rawY = event.clientY - rect.top + 16;
    setTooltipPos({
      x: Math.min(Math.max(rawX, 8), Math.max(rect.width - 232, 8)),
      y: Math.min(Math.max(rawY, 8), Math.max(rect.height - 80, 8)),
    });
    setHovered(anomaly);
  };
  const hideTooltip = () => setHovered(null);

  const selectAndCenter = (anomaly: CriticalAnomaly) => {
    setPosition({ coordinates: anomaly.coordinates, zoom: 2.4 });
    setOpenReport(anomaly);
  };

  // Selecting a zone flies the map to it, zoomed so the whole footprint fits with room to spare.
  const selectZone = (zone: ForecastZone | null) => {
    if (!zone || zone.id === selectedZoneId) {
      setSelectedZoneId(null);
      return;
    }
    setSelectedZoneId(zone.id);
    const horizon = zone.horizons[Math.min(horizonIndex, zone.horizons.length - 1)];
    const cells = [...zone.cells, ...horizon.cells];
    const lonSpan = Math.max(...cells.map((c) => c[0])) - Math.min(...cells.map((c) => c[0]));
    const latSpan = Math.max(...cells.map((c) => c[1])) - Math.min(...cells.map((c) => c[1]));
    // The map is 360 degrees wide at zoom 1; aim for the zone to fill about a third of it.
    const zoom = Math.min(MAX_ZOOM, Math.max(2.5, 120 / (Math.max(lonSpan, latSpan * 2) + 2)));
    setPosition({ coordinates: horizon.center, zoom });
  };

  return (
    <section ref={sectionRef} className="glass relative rounded-3xl">
      <div className="overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 p-5">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bio-cyan">
              <Crosshair className="h-3.5 w-3.5" /> Global critical anomaly field
            </p>
            <h2 className="mt-2 font-display text-xl font-bold text-foam">Real PACE + NOAA anomaly map</h2>
            <p className="mt-1 max-w-xl font-mono text-[10px] leading-relaxed text-silver/50">
              Every colored dot on the map is a real NASA PACE OCI satellite pixel flagged by the anomaly
              engine, cross-checked against real NOAA NDBC buoys. Colors show the detected cause. Hover any
              dot for its exact reading. Turn on Forecast to see where each patch of flagged water is
              expected to be over the next three days.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] ${
                liveAnomalyData?.liveComputed ? "border-plankton/50 bg-plankton/10 text-plankton" : "border-white/10 text-silver/55"
              }`}
            >
              {liveAnomalyData?.liveComputed ? <BrainCircuit className="h-3.5 w-3.5" /> : <DatabaseZap className="h-3.5 w-3.5" />}
              {liveAnomalyData ? (liveAnomalyData.liveComputed ? "Gemini live analysis" : "Reference dataset") : "Analyzing…"}
            </span>
            <button
              type="button"
              onClick={() => setShowLive((value) => !value)}
              aria-pressed={showLive}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                showLive ? "border-electric-teal/50 bg-electric-teal/10 text-electric-teal" : "border-white/10 text-silver/65 hover:border-electric-teal/50 hover:text-electric-teal"
              }`}
            >
              <span className="relative flex h-2 w-2">
                {ocean && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-electric-teal opacity-70" />}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-electric-teal" />
              </span>
              <Wifi className="h-3.5 w-3.5" /> {showLive ? "Live feed on" : "Live feed off"}
            </button>
            <button
              type="button"
              onClick={() => {
                // The floating cards disappear in forecast mode, so drop any tooltip tied to one.
                setHovered(null);
                setShowForecast((value) => !value);
              }}
              aria-pressed={showForecast}
              title="Show where each detected anomaly patch is expected to be over the next three days"
              className={`flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                showForecast ? "border-foam/60 bg-foam/10 text-foam" : "border-white/10 text-silver/65 hover:border-foam/50 hover:text-foam"
              }`}
            >
              <Telescope className="h-3.5 w-3.5" /> Forecast {showForecast ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => setShowCards((value) => !value)}
              aria-pressed={showCards}
              title="Toggle the info cards that float above each dot — off for a clean dots-only view"
              className={`flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                showCards ? "border-electric-teal/50 bg-electric-teal/10 text-electric-teal" : "border-white/10 text-silver/65 hover:border-electric-teal/50 hover:text-electric-teal"
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" /> Cards {showCards ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => setShowLabels((value) => !value)}
              aria-pressed={showLabels}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/65 transition hover:border-bio-cyan/50 hover:text-bio-cyan"
            >
              <Layers3 className="h-3.5 w-3.5" /> {showLabels ? "Labels on" : "Labels off"}
            </button>
          </div>
        </div>

        {/* Live source status strip */}
        <div className="flex flex-wrap items-center gap-4 border-b border-white/8 bg-electric-teal/[0.03] px-5 py-2.5">
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/55">
            <Satellite className="h-3 w-3 text-electric-teal" />
            NASA PACE OCI:{" "}
            <span className={ocean?.pace.live ? "text-electric-teal" : "text-solar"}>
              {ocean ? (ocean.pace.live ? `${ocean.pace.granules.length} live granules` : "cached reference") : "connecting…"}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/55">
            <Anchor className="h-3 w-3 text-bio-cyan" />
            NOAA CO-OPS:{" "}
            <span className={ocean?.noaa.live ? "text-bio-cyan" : "text-solar"}>
              {ocean ? (ocean.noaa.live ? `${ocean.noaa.stations.length} live buoys` : "cached reference") : "connecting…"}
              {ocean?.noaa.avgWaterTempC != null ? ` · avg ${ocean.noaa.avgWaterTempC}°C` : ""}
            </span>
          </span>
          {realPace?.live && (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/55">
              <span className="h-2 w-2 rounded-full bg-solar" />
              PACE anomalies: <span className="text-solar">{(realPace.anomaly_pixels ?? 0).toLocaleString()}</span>
              <span className="text-silver/35">· analyzed {(realPace.candidate_pixels ?? 0).toLocaleString()}</span>
              <span className="text-silver/35">· valid coords {(realPace.valid_coordinates ?? realPace.candidate_pixels ?? 0).toLocaleString()}</span>
              <span className="text-silver/35">· rendered {realPacePoints.length.toLocaleString()}</span>
            </span>
          )}
          {ocean && (
            <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.14em] text-silver/35">
              synced {new Date(ocean.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-abyssal-navy/45 p-4">
          <button
            type="button"
            onClick={isAllActive ? setNone : setAll}
            className="mr-1 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-silver/60 transition hover:border-white/30 hover:text-foam"
          >
            {isAllActive ? "Clear all" : "Select all"}
          </button>
          {METRIC_META.map((meta) => {
            const active = activeCategories.has(meta.key);
            const count = criticalAnomalies.filter((a) => a.metricKey === meta.key).length;
            const color = markerColor(meta.key);
            const Icon = meta.icon;
            return (
              <button
                key={meta.key}
                type="button"
                onClick={() => toggleCategory(meta.key)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                  active ? "border-transparent text-abyssal-navy" : "border-white/12 text-silver/50 hover:border-white/25"
                }`}
                style={active ? { backgroundColor: color } : undefined}
              >
                <Icon className="h-3 w-3" /> {meta.label}
                <span className={`rounded-full px-1.5 py-px text-[8px] ${active ? "bg-abyssal-navy/25" : "bg-white/10"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {showForecast && (
          <ForecastPanel
            forecast={forecast}
            live={Boolean(realPace?.live)}
            horizonIndex={horizonIndex}
            onHorizon={setHorizonIndex}
            selectedId={selectedZoneId}
            onSelect={selectZone}
            zones={shownZones}
            hoveredId={hoveredZoneId}
            onHover={(zone) => setHoveredZoneId(zone?.id ?? null)}
            playing={playing}
            onTogglePlay={() => setPlaying((value) => !value)}
            hiddenCauses={hiddenCauses}
            onToggleCause={toggleCause}
            sort={zoneSort}
            onSort={setZoneSort}
            onFitAll={fitAllZones}
          />
        )}

        <div className="relative bg-[#062e53]">
          {!mapMounted && <div className="aspect-[900/440] w-full" aria-hidden />}
          {mapMounted && <ComposableMap
            projection="geoEqualEarth"
            projectionConfig={{ scale: 145 }}
            width={900}
            height={440}
            className="h-auto w-full"
            role="img"
            aria-label="World map showing real NASA PACE anomaly pixels by detected cause"
          >
            <ZoomableGroup
              center={position.coordinates}
              zoom={position.zoom}
              minZoom={1}
              maxZoom={MAX_ZOOM}
              onMoveEnd={({ coordinates, zoom }) => setPosition({ coordinates, zoom })}
            >
              {/* Drawn before the land so the coastline clips each footprint to the water. */}
              {forecastOnMap && (
                <ForecastAreas forecast={forecastOnMap} horizonIndex={horizonIndex} selectedId={selectedZoneId} hoveredId={hoveredZoneId} onSelect={selectZone} onHover={(zone) => setHoveredZoneId(zone?.id ?? null)} />
              )}
              <Geographies geography={position.zoom >= DETAIL_ZOOM ? GEO_URL_DETAIL : GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#0a5b83"
                      stroke="#76b6c4"
                      strokeWidth={0.5}
                      vectorEffect="non-scaling-stroke"
                      style={{ default: { outline: "none" }, hover: { fill: "#1378a5", outline: "none" }, pressed: { outline: "none" } }}
                    />
                  ))
                }
              </Geographies>
              {visibleAnomalies.map((anomaly) => {
                const color = markerColor(anomaly.metricKey);
                const isOpen = openReport?.region === anomaly.region && openReport?.metricKey === anomaly.metricKey;
                // Offset markers that share a region so multiple critical categories
                // at the same place don't render exactly on top of each other.
                const siblings = visibleAnomalies.filter((a) => a.region === anomaly.region);
                const siblingIndex = siblings.indexOf(anomaly);
                const angle = (siblingIndex / Math.max(siblings.length, 1)) * Math.PI * 2;
                const spread = siblings.length > 1 ? 3.6 : 0;
                const coordinates: [number, number] = jitterOnWater(anomaly.coordinates, angle, spread, landFeatures);
                const Icon = anomaly.icon;
                const TrendIcon = trendGlyph(anomaly.stats.trend);
                const cardW = 116;
                const cardH = 50;
                // Counter-scale against the map's zoom so the card always renders at a
                // fixed, readable size instead of ballooning into a giant flat circle.
                const inverseScale = 1 / position.zoom;
                return (
                  <Marker key={`${anomaly.region}-${anomaly.metricKey}`} coordinates={coordinates}>
                    <g
                      style={{ transform: `scale(${inverseScale})`, transformOrigin: "0px 0px" }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${anomaly.label} critical anomaly at ${anomaly.percent}% in ${anomaly.region}`}
                      onClick={() => selectAndCenter(anomaly)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") selectAndCenter(anomaly);
                      }}
                      onMouseEnter={(event) => showTooltip(anomaly, event as unknown as ReactMouseEvent)}
                      onMouseMove={(event) => showTooltip(anomaly, event as unknown as ReactMouseEvent)}
                      onMouseLeave={hideTooltip}
                      className="cursor-pointer"
                    >
                      {/* anchor pin at the exact coordinate — always visible, on its own, when cards are off */}
                      <circle r={9} fill={color} opacity={0.16} className="animate-ping-soft" />
                      <circle r={3.2} fill={color} stroke="#062e53" strokeWidth={1.2} />
                      {/* Forecast mode clears the floating cards so the zones underneath can be read. */}
                      {showCards && !showForecast && (
                      <>
                      {/* connector line up to the card */}
                      <line x1={0} y1={-2} x2={0} y2={-cardH - 8} stroke={color} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 2" />

                      <foreignObject x={-cardW / 2} y={-cardH - 12} width={cardW} height={cardH} style={{ overflow: "visible" }}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${anomaly.label} critical anomaly at ${anomaly.percent}% in ${anomaly.region}`}
                          onClick={() => selectAndCenter(anomaly)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") selectAndCenter(anomaly);
                          }}
                          onMouseEnter={(event) => showTooltip(anomaly, event as unknown as ReactMouseEvent)}
                          onMouseMove={(event) => showTooltip(anomaly, event as unknown as ReactMouseEvent)}
                          onMouseLeave={hideTooltip}
                          className="group flex h-full w-full cursor-pointer select-none flex-col justify-between rounded-xl border px-2.5 py-1.5 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.06]"
                          style={{
                            background: "linear-gradient(140deg, rgba(4,38,63,0.92), rgba(6,46,83,0.92))",
                            borderColor: isOpen ? color : "rgba(255,255,255,0.14)",
                            boxShadow: isOpen
                              ? `0 0 0 1.5px ${color}, 0 10px 26px -6px ${color}88`
                              : "0 6px 18px -6px rgba(0,0,0,0.55)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="flex min-w-0 items-center gap-1 font-mono text-[7px] uppercase tracking-wider text-silver/70">
                              <MapPin className="h-2.5 w-2.5 shrink-0" style={{ color }} />
                              <span className="truncate">{anomaly.region}</span>
                            </span>
                            <TrendIcon
                              className="h-2.5 w-2.5 shrink-0"
                              style={{ color: anomaly.stats.trend === "rising" ? "#ff6b6b" : anomaly.stats.trend === "falling" ? "#4cc9f0" : "#ffd166" }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-display text-lg font-bold leading-none" style={{ color }}>
                              {anomaly.percent}%
                            </span>
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
                              style={{ backgroundColor: `${color}26`, color }}
                            >
                              <Icon className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </foreignObject>
                      </>
                      )}
                      {showLabels && !showForecast && (
                        <text y={16} textAnchor="middle" fill="#def3f6" fontSize={6} fontFamily="monospace" opacity={0.55} className="pointer-events-none">
                          {anomaly.label}
                        </text>
                      )}
                    </g>
                  </Marker>
                );
              })}

              {realPace?.live &&
                realPacePoints.map((point) => {
                  const score = Math.max(0, Math.min(100, point.anomaly_score));
                  const color = causeColor(point.cause);
                  const intensity = score >= 80 ? 1 : score >= 55 ? 0.78 : 0.5;
                  // Past a modest zoom the dots stop growing, so neighbouring pixels stay
                  // separate when the map is zoomed into a single forecast zone.
                  const dotScale = Math.max(1, position.zoom / 1.6);
                  const radius = (score >= 80 ? 2.3 : score >= 55 ? 1.8 : 1.3) / dotScale;
                  return (
                    <Marker key={point.id} coordinates={[point.longitude, point.latitude]}>
                      <g
                        role="img"
                        aria-label={`Real PACE pixel anomaly: ${causeLabel(point.cause)}, ${score.toFixed(1)}% anomaly score`}
                        onMouseEnter={() => setHoveredLive({ kind: "pace-pixel", point })}
                        onMouseLeave={() => setHoveredLive(null)}
                        className="cursor-pointer"
                      >
                        {score >= 80 && <circle r={radius * 2.5} fill={color} opacity={0.12 * intensity} />}
                        <circle r={radius} fill={color} opacity={intensity} stroke="#062e53" strokeWidth={0.45 / dotScale} />
                      </g>
                    </Marker>
                  );
                })}

              {showLive &&
                paceMarkers.map(({ granule, coords }) => (
                  <Marker key={granule.id} coordinates={coords}>
                    <g
                      role="img"
                      aria-label={`Live NASA PACE granule pass: ${granule.title}`}
                      onMouseEnter={() =>
                        setHoveredLive({
                          kind: "pace",
                          label: granule.title,
                          detail: `${new Date(granule.timeStart).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
                        })
                      }
                      onMouseLeave={() => setHoveredLive(null)}
                      className="cursor-pointer"
                      style={{ transform: `scale(${1 / Math.max(1, position.zoom / 2)})`, transformOrigin: "0px 0px" }}
                    >
                      <circle r={7} fill="none" stroke="#76b6c4" strokeWidth={1} opacity={0.6} className="animate-ping-soft" />
                      <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" stroke="#def3f6" strokeWidth={1.4} strokeLinecap="round" />
                      <circle r={2.4} fill="#76b6c4" />
                    </g>
                  </Marker>
                ))}

              {showLive &&
                noaaBuoys.map((buoy) => (
                  <Marker key={buoy.station} coordinates={[buoy.lon, buoy.lat]}>
                    <g
                      role="img"
                      aria-label={`Live NOAA buoy ${buoy.name}, ${buoy.waterTempC ?? "n/a"}°C`}
                      onMouseEnter={() =>
                        setHoveredLive({
                          kind: "noaa",
                          label: buoy.name,
                          detail: buoy.waterTempC != null ? `${buoy.waterTempC}°C water temp` : "no reading",
                        })
                      }
                      onMouseLeave={() => setHoveredLive(null)}
                      className="cursor-pointer"
                      style={{ transform: `scale(${1 / Math.max(1, position.zoom / 2)})`, transformOrigin: "0px 0px" }}
                    >
                      <circle r={6} fill="#1da2d8" opacity={0.18} className="animate-ping-soft" />
                      <circle r={3.2} fill="#062e53" stroke="#1da2d8" strokeWidth={1.3} />
                      <circle r={1.2} fill="#1da2d8" />
                    </g>
                  </Marker>
                ))}

              {forecastOnMap && (
                <ForecastPins forecast={forecastOnMap} horizonIndex={horizonIndex} selectedId={selectedZoneId} hoveredId={hoveredZoneId} onSelect={selectZone} onHover={(zone) => setHoveredZoneId(zone?.id ?? null)} zoom={position.zoom} />
              )}
            </ZoomableGroup>
          </ComposableMap>}

          {hoveredZone && !hoveredLive && (
            <div
              className="pointer-events-none absolute left-4 top-4 z-20 max-w-[17rem] rounded-xl border bg-[#04263f]/95 p-3 shadow-xl backdrop-blur-md"
              style={{ borderColor: `${causeColor(hoveredZone.cause)}66` }}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: causeColor(hoveredZone.cause) }}>
                <Telescope className="h-3 w-3" /> Zone {hoveredZone.rank} · {causePlain(hoveredZone.cause)}
              </p>
              <p className="mt-1 font-display text-xs font-semibold text-foam">{zoneName(hoveredZone)}</p>
              <p className="mt-1 text-[11px] text-silver/65">
                {hoveredZone.pixels.flagged} of {hoveredZone.pixels.valid} pixels flagged · {SIGNAL_LABEL[hoveredZone.signal].toLowerCase()}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-silver/50">
                {formatCoord(hoveredZone.horizons[Math.min(horizonIndex, hoveredZone.horizons.length - 1)].center)} · click for details
              </p>
            </div>
          )}

          {hoveredLive && (
            <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[16rem] rounded-xl border border-electric-teal/30 bg-[#04263f]/95 p-3 shadow-xl backdrop-blur-md">
              {hoveredLive.kind === "pace-pixel" ? (
                <>
                  <p
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em]"
                    style={{ color: causeColor(hoveredLive.point.cause) }}
                  >
                    <Satellite className="h-3 w-3" /> {causeLabel(hoveredLive.point.cause)}
                  </p>
                  <p className="mt-1 font-display text-xs font-semibold text-foam">Real PACE OCI pixel · {hoveredLive.point.severity} severity</p>
                  <p className="mt-1 font-mono text-[9px] text-silver/65">Anomaly score: {hoveredLive.point.anomaly_score.toFixed(1)}%</p>
                  <p className="mt-0.5 font-mono text-[9px] text-silver/65">Detector confidence: {(hoveredLive.point.confidence * 100).toFixed(1)}%</p>
                  {hoveredLive.point.noaa?.station && (
                    <p className="mt-0.5 font-mono text-[9px] text-silver/65">
                      NOAA {hoveredLive.point.noaa.station}
                      {hoveredLive.point.noaa.distance_km != null ? ` · ${hoveredLive.point.noaa.distance_km.toFixed(0)} km away` : ""}
                      {hoveredLive.point.noaa.water_temp_c != null ? ` · ${hoveredLive.point.noaa.water_temp_c}°C` : ""}
                    </p>
                  )}
                  <p className="mt-0.5 font-mono text-[9px] text-silver/45">{hoveredLive.point.latitude.toFixed(3)}°, {hoveredLive.point.longitude.toFixed(3)}°</p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-electric-teal">
                    {hoveredLive.kind === "pace" ? <Satellite className="h-3 w-3" /> : <Anchor className="h-3 w-3" />}
                    {hoveredLive.kind === "pace" ? "PACE granule" : "NOAA buoy"}
                  </p>
                  <p className="mt-1 truncate font-display text-xs font-semibold text-foam">{hoveredLive.label}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-silver/50">{hoveredLive.detail}</p>
                </>
              )}
            </div>
          )}

          <div className="absolute bottom-4 left-4 flex max-w-[70%] flex-wrap gap-2 rounded-xl border border-white/10 bg-[#062e53]/90 p-2 backdrop-blur-md">
            {realPace?.live &&
              Object.entries(CAUSE_COLORS).map(([cause, color]) => (
                <span key={cause} className="flex items-center gap-1.5 font-mono text-[8px] text-silver/65">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {causeLabel(cause)}
                </span>
              ))}
            {showLive && (
              <>
                <span className="flex items-center gap-1.5 border-l border-white/10 pl-2 font-mono text-[8px] text-silver/65">
                  <span className="h-2 w-2 rounded-full border border-foam bg-transparent" /> PACE pass
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[8px] text-silver/65">
                  <span className="h-2 w-2 rounded-full bg-bio-cyan" /> NOAA buoy
                </span>
              </>
            )}
            {forecastOnMap && (
              <>
                <span className="flex items-center gap-1.5 border-l border-white/10 pl-2 font-mono text-[8px] text-silver/65">
                  <span className="h-2.5 w-3.5 rounded-[3px] bg-foam/60" /> Patch as seen
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[8px] text-silver/65">
                  <span className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-foam bg-foam/15" /> Forecast area
                </span>
              </>
            )}
          </div>

          <div className="absolute right-4 top-4 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#062e53]/90 backdrop-blur-md">
            <button type="button" onClick={() => setPosition((value) => ({ ...value, zoom: Math.min(value.zoom * 1.35, MAX_ZOOM) }))} className="p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPosition((value) => ({ ...value, zoom: Math.max(value.zoom / 1.35, 1) }))} className="border-t border-white/10 p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPosition({ coordinates: [0, 12], zoom: 1 })} className="border-t border-white/10 p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Reset map"><RotateCcw className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      {hovered && !openReport && (
        <div
          className="pointer-events-none absolute z-30 w-64 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            borderColor: `${markerColor(hovered.metricKey)}40`,
            backgroundColor: "#04263fF2",
          }}
        >
          {/* Header strip: region + status pill */}
          <div
            className="flex items-center justify-between gap-2 border-b border-white/8 px-3.5 py-2"
            style={{ backgroundColor: `${statusColor(hovered.percent)}14` }}
          >
            <span className="flex items-center gap-1.5 truncate font-mono text-[9px] uppercase tracking-[0.16em] text-bio-cyan">
              <MapPin className="h-3 w-3 shrink-0" /> {hovered.region}
            </span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em]"
              style={{ backgroundColor: `${statusColor(hovered.percent)}22`, color: statusColor(hovered.percent) }}
            >
              {statusLabel(hovered.percent)}
            </span>
          </div>

          <div className="p-3.5">
            {/* Category name + icon */}
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${markerColor(hovered.metricKey)}1f`, color: markerColor(hovered.metricKey) }}
              >
                <hovered.icon className="h-3.5 w-3.5" />
              </span>
              <p className="font-display text-sm font-semibold leading-tight text-foam">{hovered.label}</p>
            </div>

            {/* Severity gauge */}
            <div className="mt-3 flex items-center gap-2.5">
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${hovered.percent}%`, backgroundColor: statusColor(hovered.percent) }}
                />
              </div>
              <span className="font-mono text-sm font-bold tabular-nums" style={{ color: statusColor(hovered.percent) }}>
                {hovered.percent}%
              </span>
            </div>

            {/* Stat row */}
            <div className="mt-3 flex items-center justify-between font-mono text-[9px] text-silver/60">
              <span className="flex items-center gap-1"><Radar className="h-3 w-3" /> {hovered.stats.occurrences} detections</span>
              <span
                className="flex items-center gap-1"
                style={{ color: hovered.stats.trend === "rising" ? "#ff6b6b" : hovered.stats.trend === "falling" ? "#4cc9f0" : "#ffd166" }}
              >
                {(() => {
                  const TrendIcon = trendGlyph(hovered.stats.trend);
                  return <TrendIcon className="h-3 w-3" />;
                })()}
                {hovered.stats.trend === "rising" ? `+${hovered.stats.weekOverWeek}%` : hovered.stats.trend === "falling" ? `${hovered.stats.weekOverWeek}%` : "stable"} WoW
              </span>
            </div>

            <p className="mt-3 border-t border-white/8 pt-2 text-center font-mono text-[8px] uppercase tracking-[0.14em] text-silver/35">
              Click marker for full causal report
            </p>
          </div>
        </div>
      )}

      <AnomalyReportPanel anomaly={openReport} onClose={() => setOpenReport(null)} />
    </section>
  );
}
