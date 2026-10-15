"use client";

import { useState } from "react";
import { ArrowUpDown, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, History, Info, LocateFixed, Maximize2, Pause, Play, Route, Satellite, ShieldCheck, Telescope, X } from "lucide-react";
import {
  SIGNAL_LABEL,
  causeColor,
  causeLabel,
  causePlain,
  compass,
  formatCoord,
  searchRadiusKm,
  toCSV,
  toGeoJSON,
  zoneName,
  type Forecast,
  type ForecastHorizon,
  type ForecastZone,
} from "./forecast";

type PanelProps = {
  forecast: Forecast | undefined;
  /** False while the ML service has no live satellite snapshot to forecast from. */
  live: boolean;
  horizonIndex: number;
  onHorizon: (index: number) => void;
  selectedId: string | null;
  onSelect: (zone: ForecastZone | null) => void;
  /** Zones after the cause filter and sort order have been applied. */
  zones: ForecastZone[];
  hoveredId: string | null;
  onHover: (zone: ForecastZone | null) => void;
  playing: boolean;
  onTogglePlay: () => void;
  /** Causes currently hidden. */
  hiddenCauses: Set<string>;
  onToggleCause: (cause: string) => void;
  sort: ZoneSort;
  onSort: (sort: ZoneSort) => void;
  onFitAll: () => void;
};

export type ZoneSort = "strength" | "size" | "drift" | "newest";

const SORT_LABEL: Record<ZoneSort, string> = {
  strength: "Strongest signal",
  size: "Largest area",
  drift: "Moves the most",
  newest: "Most recently seen",
};

export function sortZones(zones: ForecastZone[], sort: ZoneSort) {
  const last = (zone: ForecastZone) => zone.horizons[zone.horizons.length - 1];
  const by: Record<ZoneSort, (a: ForecastZone, b: ForecastZone) => number> = {
    strength: (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
    size: (a, b) => b.area_km2 - a.area_km2,
    drift: (a, b) => last(b).drift_km - last(a).drift_km,
    newest: (a, b) => b.observed_at.localeCompare(a.observed_at),
  };
  return [...zones].sort(by[sort]);
}

function ago(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return hours < 36 ? `${Math.max(1, Math.round(hours))} h ago` : `${Math.round(hours / 24)} days ago`;
}

const HORIZON_NAME: Record<number, string> = { 0: "Now", 24: "Tomorrow", 48: "In 2 days", 72: "In 3 days" };

function when(iso: string) {
  return `${new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

function driftText(horizon: ForecastHorizon) {
  if (horizon.currents === "unavailable") return "No current data here";
  if (horizon.drift_km < 5) return "Barely moves";
  return `${Math.round(horizon.drift_km)} km ${compass(horizon.drift_bearing_deg)}`;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const SIGNAL_STYLE: Record<ForecastZone["signal"], string> = {
  strong: "border-plankton/50 bg-plankton/10 text-plankton",
  moderate: "border-solar/50 bg-solar/10 text-solar",
  weak: "border-white/15 bg-white/5 text-silver/70",
};

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center">
      <p className="font-display text-sm font-semibold text-foam">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-silver/60">{children}</p>
    </div>
  );
}

export function ForecastPanel({
  forecast, live, horizonIndex, onHorizon, selectedId, onSelect, zones: shown, hoveredId, onHover,
  playing, onTogglePlay, hiddenCauses, onToggleCause, sort, onSort, onFitAll,
}: PanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  // `zones` is every zone in the forecast; `shown` is what the filter and sort leave.
  const zones = forecast?.available ? forecast.zones : [];
  const hours = forecast?.horizons_hours ?? [0, 24, 48, 72];
  const selected = zones.find((zone) => zone.id === selectedId) ?? null;
  const causes = [...new Set(zones.map((zone) => zone.cause))];
  const totalArea = shown.reduce((sum, zone) => sum + zone.area_km2, 0);
  const step = (offset: number) => {
    if (!selected || shown.length === 0) return;
    const at = shown.findIndex((zone) => zone.id === selected.id);
    onSelect(shown[(at + offset + shown.length) % shown.length]);
  };
  const record = forecast?.track_record;
  const backtest = forecast?.backtest;
  const newestPass = zones.reduce<string | null>((latest, zone) => (!latest || zone.observed_at > latest ? zone.observed_at : latest), null);
  const passAgeDays = newestPass ? (Date.now() - new Date(newestPass).getTime()) / 86_400_000 : 0;

  const copy = async (zone: ForecastZone, horizon: ForecastHorizon) => {
    try {
      await navigator.clipboard.writeText(`${horizon.center[1]}, ${horizon.center[0]}`);
      setCopied(zone.id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — the coordinates are still on screen */
    }
  };

  return (
    <div className="border-b border-white/8 bg-gradient-to-b from-foam/[0.05] to-transparent p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 font-display text-base font-bold text-foam">
            <Telescope className="h-4 w-4 text-bio-cyan" /> Where to look next
          </p>
          <p className="mt-1 text-xs leading-relaxed text-silver/65">
            Each zone is a patch of unusual water the PACE satellite actually saw, moved forward with forecast ocean
            currents. Pick a time to see where it should be.
          </p>
        </div>

        {zones.length > 0 && (
          <div role="tablist" aria-label="Forecast time" className="flex items-stretch rounded-2xl border border-white/10 bg-abyssal-navy/60 p-1">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-pressed={playing}
              aria-label={playing ? "Pause the forecast animation" : "Play the forecast through the next three days"}
              title={playing ? "Pause" : "Play through the next three days"}
              className={`mr-1 flex w-10 items-center justify-center rounded-xl transition ${playing ? "bg-bio-cyan/20 text-bio-cyan" : "text-silver/70 hover:bg-white/5 hover:text-foam"}`}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            {hours.map((hour, index) => {
              const active = index === horizonIndex;
              return (
                <button
                  key={hour}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onHorizon(index)}
                  className={`rounded-xl px-3.5 py-2 text-left transition ${active ? "bg-foam text-abyssal-navy shadow-lg" : "text-silver/70 hover:text-foam"}`}
                >
                  <span className="block font-display text-xs font-bold leading-none">{HORIZON_NAME[hour] ?? `+${hour} h`}</span>
                  <span className={`mt-1 block font-mono text-[9px] leading-none ${active ? "text-abyssal-navy/65" : "text-silver/45"}`}>
                    {hour === 0 ? "current position" : `+${hour} hours`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {zones.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-silver/70">
          {newestPass && (
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${passAgeDays > 3 ? "border-solar/40 text-solar" : "border-white/10"}`}>
              <Satellite className="h-3 w-3" /> Satellite pass {when(newestPass)}
              {passAgeDays > 3 ? ` · ${Math.floor(passAgeDays)} days old` : ""}
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
            <CalendarClock className="h-3 w-3" /> Showing {when(zones[0].horizons[Math.min(horizonIndex, zones[0].horizons.length - 1)].valid_time)}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
            <ShieldCheck className="h-3 w-3" />
            {record && record.verified > 0
              ? `${record.present} of ${record.verified} checked forecasts still showed the anomaly`
              : "Live forecasts not yet checked against a later pass"}
          </span>
          {/* Shown only until live forecasts have their own record, so one set of passes is never counted twice. */}
          {backtest && backtest.verified > 0 && !(record && record.verified > 0) && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1"
              title={`Backtest over ${backtest.days} days from ${backtest.start}, box ${backtest.bbox.join(", ")}. With no forecast, ${backtest.base_rate.present} of ${backtest.base_rate.cells} observed cells met the same test.`}
            >
              <History className="h-3 w-3" /> Backtest: {backtest.present} of {backtest.verified} confirmed (small sample)
            </span>
          )}
        </div>
      )}

      {zones.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {causes.map((cause) => {
            const on = !hiddenCauses.has(cause);
            const color = causeColor(cause);
            const count = zones.filter((zone) => zone.cause === cause).length;
            return (
              <button
                key={cause}
                type="button"
                onClick={() => onToggleCause(cause)}
                aria-pressed={on}
                title={causeLabel(cause)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition ${on ? "text-foam" : "border-white/10 text-silver/40 line-through"}`}
                style={on ? { borderColor: `${color}88`, backgroundColor: `${color}1a` } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, opacity: on ? 1 : 0.35 }} />
                {causePlain(cause)}
                <span className="rounded-full bg-white/10 px-1.5 text-[10px] no-underline">{count}</span>
              </button>
            );
          })}
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-silver/55">
            <ArrowUpDown className="h-3 w-3" /> Sort
            <select
              value={sort}
              onChange={(event) => onSort(event.target.value as ZoneSort)}
              className="rounded-full border border-white/12 bg-abyssal-navy px-2.5 py-1.5 text-[11px] text-foam outline-none transition hover:border-white/25 focus:border-bio-cyan/60"
            >
              {(Object.keys(SORT_LABEL) as ZoneSort[]).map((key) => (
                <option key={key} value={key}>{SORT_LABEL[key]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onFitAll}
            className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-silver/75 transition hover:border-bio-cyan/60 hover:text-bio-cyan"
          >
            <Maximize2 className="h-3 w-3" /> Show all on map
          </button>
          <p className="w-full text-[11px] text-silver/45">
            {shown.length} of {zones.length} zones · about {Math.round(totalArea / 1000).toLocaleString()} thousand km² in total · hover a zone to find it on the map
          </p>
        </div>
      )}

      <div className="mt-3">
        {!live ? (
          <Empty title="Forecast needs live satellite data">
            The forecast is built from real PACE detections. Start the ML service and wait for its first satellite refresh.
          </Empty>
        ) : !forecast ? (
          <Empty title="Forecast is being prepared">The next satellite refresh will include forecast zones.</Empty>
        ) : !forecast.available ? (
          <Empty title="Forecast unavailable right now">{forecast.reason ?? "The forecast step did not complete."}</Empty>
        ) : zones.length === 0 ? (
          <Empty title="Nothing to forecast from the latest pass">
            The satellite found no patch of anomalous water large enough to track. Scattered single pixels are shown on the
            map but are not forecast.
          </Empty>
        ) : shown.length === 0 ? (
          <Empty title="Every zone is filtered out">Turn a cause back on above to see its zones.</Empty>
        ) : (
          <div className="grid max-h-[22rem] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((zone, index) => {
              const horizon = zone.horizons[Math.min(horizonIndex, zone.horizons.length - 1)];
              const color = causeColor(zone.cause);
              const active = zone.id === selectedId;
              const lit = active || zone.id === hoveredId;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => onSelect(active ? null : zone)}
                  onMouseEnter={() => onHover(zone)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(zone)}
                  onBlur={() => onHover(null)}
                  aria-pressed={active}
                  data-cursor="hover"
                  className={`group rounded-2xl border p-3.5 text-left transition-all duration-300 hover:-translate-y-0.5 ${
                    lit ? "bg-white/[0.07]" : "border-white/8 bg-white/[0.025]"
                  }`}
                  style={lit ? { borderColor: color, boxShadow: `0 10px 28px -10px ${color}88` } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border font-display text-sm font-bold"
                      style={{ borderColor: `${color}66`, backgroundColor: `${color}1f`, color }}
                    >
                      {zone.rank ?? index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-semibold text-foam">{zoneName(zone)}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-silver/70">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <span className="truncate">{causePlain(zone.cause)}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SIGNAL_STYLE[zone.signal]}`}>
                      {SIGNAL_LABEL[zone.signal]}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    <div>
                      <dt className="flex items-center gap-1 text-silver/45"><LocateFixed className="h-3 w-3" /> Centre</dt>
                      <dd className="mt-0.5 font-mono text-[10.5px] text-foam/90">{formatCoord(horizon.center)}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-silver/45"><Route className="h-3 w-3" /> Drift since pass</dt>
                      <dd className="mt-0.5 font-mono text-[10.5px] text-foam/90">{driftText(horizon)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2.5 text-[10.5px] text-silver/50">
                    Search within about {searchRadiusKm(zone, horizon)} km · {zone.pixels.flagged} of {zone.pixels.valid} pixels flagged · seen {ago(zone.observed_at)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <ZoneDetail
          zone={selected}
          rank={selected.rank ?? zones.indexOf(selected) + 1}
          onStep={shown.length > 1 ? step : null}
          horizonIndex={horizonIndex}
          onHorizon={onHorizon}
          copied={copied === selected.id}
          onCopy={copy}
          onClose={() => onSelect(null)}
        />
      )}

      {forecast?.available && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowMethod((value) => !value)}
            aria-expanded={showMethod}
            className="flex items-center gap-1.5 text-[11px] text-silver/60 transition hover:text-foam"
          >
            <Info className="h-3.5 w-3.5" /> How this forecast works and what it cannot do
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMethod ? "rotate-180" : ""}`} />
          </button>
          {zones.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => download("oceannova-forecast-zones.geojson", JSON.stringify(toGeoJSON(forecast)), "application/geo+json")}
                className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-silver/75 transition hover:border-bio-cyan/60 hover:text-bio-cyan"
              >
                <Download className="h-3 w-3" /> GeoJSON
              </button>
              <button
                type="button"
                onClick={() => download("oceannova-forecast-zones.csv", toCSV(forecast), "text/csv")}
                className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-silver/75 transition hover:border-bio-cyan/60 hover:text-bio-cyan"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
            </div>
          )}
        </div>
      )}

      {showMethod && forecast?.available && (
        <div className="mt-3 rounded-2xl border border-white/8 bg-abyssal-navy/50 p-4 text-xs leading-relaxed text-silver/70">
          <p className="text-foam/90">{forecast.method}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {(forecast.assumptions ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {forecast.sources && (
            <p className="mt-2 text-[11px] text-silver/45">
              Detections: {forecast.sources.detections}. Currents: {forecast.sources.currents}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ZoneDetail({
  zone,
  rank,
  onStep,
  horizonIndex,
  onHorizon,
  copied,
  onCopy,
  onClose,
}: {
  zone: ForecastZone;
  rank: number;
  /** Move to the previous (-1) or next (+1) zone in the list; null when there is only one. */
  onStep: ((offset: number) => void) | null;
  horizonIndex: number;
  onHorizon: (index: number) => void;
  copied: boolean;
  onCopy: (zone: ForecastZone, horizon: ForecastHorizon) => void;
  onClose: () => void;
}) {
  const color = causeColor(zone.cause);
  const horizon = zone.horizons[Math.min(horizonIndex, zone.horizons.length - 1)];
  const last = zone.horizons[zone.horizons.length - 1];
  const mix = Object.entries(zone.cause_mix).sort((a, b) => b[1] - a[1]);
  const moves = last.currents === "forecast" && last.drift_km >= 5;

  return (
    <div className="mt-3 rounded-2xl border bg-[#04263f]/80 p-4" style={{ borderColor: `${color}55` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-bold text-foam">
            Zone {rank} · {zoneName(zone)}
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-silver/70">
            PACE flagged {zone.pixels.flagged} of {zone.pixels.valid} pixels here on {when(zone.observed_at)}, over about{" "}
            {zone.area_km2.toLocaleString()} km².{" "}
            {moves
              ? `Forecast currents carry the patch about ${Math.round(last.drift_km)} km ${compass(last.drift_bearing_deg)} by ${when(last.valid_time)}.`
              : last.currents === "forecast"
                ? "Forecast currents are weak here, so the patch should stay close to where it was seen."
                : "No current forecast is available at this spot, so the zone is shown where it was seen."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onStep && (
            <>
              <button type="button" onClick={() => onStep(-1)} aria-label="Previous zone" className="rounded-full p-1 text-silver/60 transition hover:bg-white/10 hover:text-foam">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onStep(1)} aria-label="Next zone" className="rounded-full p-1 text-silver/60 transition hover:bg-white/10 hover:text-foam">
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button type="button" onClick={onClose} aria-label="Close zone details" className="rounded-full p-1 text-silver/60 transition hover:bg-white/10 hover:text-foam">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-[11px]">
            <thead>
              <tr className="text-silver/45">
                <th className="pb-1.5 font-normal">When</th>
                <th className="pb-1.5 font-normal">Expected centre</th>
                <th className="pb-1.5 font-normal">Drift</th>
                <th className="pb-1.5 font-normal">Search within</th>
              </tr>
            </thead>
            <tbody>
              {zone.horizons.map((row, index) => (
                <tr
                  key={row.hours}
                  onClick={() => onHorizon(index)}
                  className={`cursor-pointer border-t border-white/6 transition hover:bg-white/5 ${index === horizonIndex ? "bg-white/[0.06] text-foam" : "text-silver/75"}`}
                >
                  <td className="py-1.5 pr-3">{when(row.valid_time)}</td>
                  <td className="py-1.5 pr-3 font-mono text-[10.5px]">{formatCoord(row.center)}</td>
                  <td className="py-1.5 pr-3">{driftText(row)}</td>
                  <td className="py-1.5">about {searchRadiusKm(zone, row)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className="text-[11px] text-silver/45">What the model thinks it is</p>
          <div className="mt-1.5 space-y-1.5">
            {mix.map(([cause, share]) => (
              <div key={cause} title={causeLabel(cause)}>
                <div className="flex justify-between text-[11px] text-silver/75">
                  <span>{causePlain(cause)}</span>
                  <span className="font-mono text-[10.5px]">{Math.round(share * 100)}%</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: causeColor(cause) }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-silver/45">
            Cause labels come from a model trained on rule-based labels. They have not been checked against water samples.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onCopy(zone, horizon)}
          className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-silver/80 transition hover:border-bio-cyan/60 hover:text-bio-cyan"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy centre coordinates"}
        </button>
        <span className="text-[11px] text-silver/50">
          {zone.track_record && zone.track_record.verified > 0
            ? `Past ${causePlain(zone.cause).toLowerCase()} forecasts: ${zone.track_record.present} of ${zone.track_record.verified} still showed the anomaly when next observed.`
            : `${SIGNAL_LABEL[zone.signal]} describes how clear today's detection is. It is not a probability.`}
        </span>
      </div>
    </div>
  );
}
