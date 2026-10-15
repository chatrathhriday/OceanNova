"use client";

import { useMemo } from "react";
import { Marker, useMapContext } from "react-simple-maps";
import { causeColor, causePlain, detectedShape, forecastShape, zoneName, type Forecast, type ForecastZone } from "./forecast";

type LayerProps = {
  forecast: Forecast;
  horizonIndex: number;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (zone: ForecastZone) => void;
  onHover: (zone: ForecastZone | null) => void;
};

function horizonOf(zone: ForecastZone, index: number) {
  return zone.horizons[Math.min(index, zone.horizons.length - 1)];
}

/** Footprints drawn in map coordinates: where each patch was seen, where it should be at the
 * chosen time, and the path between the two. Render inside <ZoomableGroup>, before the land. */
export function ForecastAreas({ forecast, horizonIndex, selectedId, hoveredId, onSelect, onHover }: LayerProps) {
  const { path } = useMapContext();
  const cellDeg = forecast.cell_deg ?? 0.5;

  const shapes = useMemo(
    () =>
      forecast.zones.map((zone) => {
        const horizon = horizonOf(zone, horizonIndex);
        // The whole three-day path stays visible; the part already travelled is drawn brighter.
        const full = [zone.centroid, ...zone.horizons.map((h) => h.center)];
        const done = full.slice(0, Math.min(horizonIndex, zone.horizons.length - 1) + 2);
        return {
          zone,
          detected: path(detectedShape(zone, cellDeg)) ?? "",
          area: path(forecastShape(horizon, cellDeg)) ?? "",
          fullTrack: path({ type: "LineString", coordinates: full }) ?? "",
          track: path({ type: "LineString", coordinates: done }) ?? "",
        };
      }),
    [forecast, horizonIndex, path, cellDeg],
  );

  const focusId = hoveredId ?? selectedId;

  return (
    <g>
      {shapes.map(({ zone, detected, area, fullTrack, track }) => {
        const color = causeColor(zone.cause);
        const active = zone.id === selectedId || zone.id === hoveredId;
        return (
          <g
            key={zone.id}
            opacity={focusId && !active ? 0.35 : 1}
            onClick={() => onSelect(zone)}
            onMouseEnter={() => onHover(zone)}
            onMouseLeave={() => onHover(null)}
            className="cursor-pointer transition-opacity duration-300"
          >
            {/* Where the patch should be at the chosen time, including position uncertainty. */}
            <path
              d={area}
              fill={color}
              fillOpacity={active ? 0.32 : 0.18}
              stroke="#f8fdff"
              strokeOpacity={active ? 0.95 : 0.65}
              strokeWidth={active ? 1.8 : 1.1}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={active ? "forecast-march" : undefined}
              style={{ transition: "fill-opacity 300ms" }}
            />
            {/* Where the satellite saw it. */}
            <path d={detected} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={fullTrack} fill="none" stroke="#f8fdff" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="2 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={track} fill="none" stroke="#f8fdff" strokeOpacity={0.95} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </g>
  );
}

/** Numbered pins that stay the same size at every zoom, so a zone a few pixels wide on the
 * world view can still be found and clicked. Render inside <ZoomableGroup>, above the markers. */
export function ForecastPins({ forecast, horizonIndex, selectedId, hoveredId, onSelect, onHover, zoom }: LayerProps & { zoom: number }) {
  const focusId = hoveredId ?? selectedId;
  // Active pins are drawn last so they sit on top of any neighbours they overlap.
  const ordered = [...forecast.zones].sort((a, b) => Number(a.id === focusId) - Number(b.id === focusId));
  return (
    <>
      {ordered.map((zone, index) => {
        const horizon = horizonOf(zone, horizonIndex);
        const color = causeColor(zone.cause);
        const active = zone.id === selectedId || zone.id === hoveredId;
        const rank = zone.rank ?? index + 1;
        const label = `Forecast zone ${rank}: ${causePlain(zone.cause)}, ${zoneName(zone)}`;
        // On the world view pins shrink so a cluster of nearby zones stays readable.
        const size = active ? 1.15 : zoom < 2.5 ? 0.72 : 1;
        return (
          <Marker key={zone.id} coordinates={horizon.center}>
            <g
              style={{ transform: `scale(${size / zoom})`, transformOrigin: "0px 0px", transition: "transform 200ms" }}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={zone.id === selectedId}
              onClick={() => onSelect(zone)}
              onMouseEnter={() => onHover(zone)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(zone)}
              onBlur={() => onHover(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(zone);
              }}
              className="cursor-pointer outline-none"
              opacity={focusId && !active ? 0.55 : 1}
            >
              <line x1={0} y1={0} x2={0} y2={-13} stroke="#f8fdff" strokeWidth={1.2} />
              <circle r={2.2} fill="#f8fdff" />
              <circle cy={-22} r={active ? 15 : 12} fill={color} opacity={0.22} className="animate-ping-soft" />
              <circle cy={-22} r={9.5} fill={active ? color : "#04263f"} stroke={active ? "#f8fdff" : color} strokeWidth={active ? 2 : 1.6} />
              <text y={-18.8} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={active ? "#04263f" : "#f8fdff"} className="pointer-events-none select-none font-display">
                {rank}
              </text>
            </g>
          </Marker>
        );
      })}
    </>
  );
}
