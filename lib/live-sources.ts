/**
 * Shared, server-only fetchers for real public government ocean-data feeds.
 * No auth required. Every fetch is wrapped so a network hiccup never breaks
 * the caller — it always resolves with a `live` flag so the UI can be honest
 * about whether a given number is a live reading or a cached reference value.
 */

export type Granule = {
  id: string;
  title: string;
  timeStart: string;
  timeEnd: string;
  bbox: string | null;
};

export type BuoyObs = {
  station: string;
  name: string;
  lat: number;
  lon: number;
  waterTempC: number | null;
  waveHeightM: number | null;
  time: string;
};

export const PACE_FALLBACK: Granule[] = [
  {
    id: "PACE_OCI.20260904",
    title: "PACE_OCI_L2_BGC — Arabian Sea pass",
    timeStart: "2026-09-04T08:12:00Z",
    timeEnd: "2026-09-04T08:17:00Z",
    bbox: "58.0,10.0,70.0,22.0",
  },
  {
    id: "PACE_OCI.20260904b",
    title: "PACE_OCI_L2_AOP — Bay of Bengal pass",
    timeStart: "2026-09-04T04:41:00Z",
    timeEnd: "2026-09-04T04:46:00Z",
    bbox: "80.0,6.0,93.0,20.0",
  },
  {
    id: "PACE_OCI.20260903",
    title: "PACE_OCI_L2_BGC — Gulf of Mexico pass",
    timeStart: "2026-09-03T18:03:00Z",
    timeEnd: "2026-09-03T18:08:00Z",
    bbox: "-96.0,20.0,-84.0,29.0",
  },
];

export const NOAA_FALLBACK: BuoyObs[] = [
  { station: "41008", name: "Grays Reef, GA", lat: 31.4, lon: -80.87, waterTempC: 27.3, waveHeightM: 1.1, time: "recent" },
  { station: "46042", name: "Monterey Bay, CA", lat: 36.79, lon: -122.4, waterTempC: 14.8, waveHeightM: 2.4, time: "recent" },
  { station: "51001", name: "NW Hawaii", lat: 24.45, lon: -162.0, waterTempC: 25.9, waveHeightM: 2.0, time: "recent" },
];

/** Recent PACE OCI Level-2 granule listing from NASA's CMR catalog (search.earthdata.nasa.gov backend). */
export async function fetchPaceGranules(): Promise<{ data: Granule[]; live: boolean }> {
  try {
    const url =
      "https://cmr.earthdata.nasa.gov/search/granules.json" +
      "?short_name=PACE_OCI_L2_BGC&sort_key=-start_date&page_size=40";
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`CMR ${res.status}`);
    const json = (await res.json()) as {
      feed?: { entry?: Array<Record<string, unknown>> };
    };
    const entries = json.feed?.entry ?? [];
    if (entries.length === 0) throw new Error("no entries");
    const data: Granule[] = entries.map((e) => {
      const boxes = (e.boxes as string[] | undefined)?.[0] ?? null;
      return {
        id: String(e.id ?? e.title ?? "granule"),
        title: String(e.title ?? e.producer_granule_id ?? "PACE OCI L2 granule"),
        timeStart: String(e.time_start ?? ""),
        timeEnd: String(e.time_end ?? ""),
        bbox: boxes,
      };
    });
    return { data, live: true };
  } catch {
    return { data: PACE_FALLBACK, live: false };
  }
}

/** NOAA CO-OPS coastal water-temperature readings — used for the site-wide live status strip. */
export async function fetchNoaaBuoys(): Promise<{ data: BuoyObs[]; live: boolean }> {
  const stations: { id: string; name: string; lat: number; lon: number }[] = [
    { id: "8723214", name: "Virginia Key, FL", lat: 25.73, lon: -80.16 },
    { id: "9410230", name: "La Jolla, CA", lat: 32.87, lon: -117.26 },
    { id: "8443970", name: "Boston, MA", lat: 42.35, lon: -71.05 },
  ];
  try {
    // A station can stop reporting water temperature without notice — keep whichever
    // ones answer instead of dropping the whole strip to the cached reference.
    const settled = await Promise.allSettled(
      stations.map(async (s) => {
        const url =
          "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter" +
          `?product=water_temperature&date=latest&station=${s.id}` +
          "&time_zone=gmt&units=metric&format=json";
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`NOAA ${s.id} ${res.status}`);
        const json = (await res.json()) as {
          data?: Array<{ t: string; v: string }>;
        };
        const point = json.data?.[0];
        if (!point) throw new Error("no data");
        return {
          station: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          waterTempC: point.v ? Number(point.v) : null,
          waveHeightM: null,
          time: point.t,
        } satisfies BuoyObs;
      })
    );
    const results = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (results.length === 0) throw new Error("no stations reporting");
    return { data: results, live: true };
  } catch {
    return { data: NOAA_FALLBACK, live: false };
  }
}

/**
 * NOAA NDBC "latest observations" bulk feed — one request that returns the
 * current reading for every active buoy worldwide (station, position, water
 * temperature, wave height). Used to ground the deep-ocean regions the
 * coastal CO-OPS stations above don't reach (gyres, passages, open sea).
 */
export async function fetchNdbcLatestObs(): Promise<{ data: BuoyObs[]; live: boolean }> {
  try {
    const res = await fetch("https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt", {
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`NDBC ${res.status}`);
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
    const data: BuoyObs[] = [];
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      // STN LAT LON YY MM DD hh mm WDIR WSPD GST WVHT ... WTMP ...
      if (cols.length < 19) continue;
      const [station, latStr, lonStr] = cols;
      const lat = Number(latStr);
      const lon = Number(lonStr);
      const wvht = Number(cols[11]);
      const wtmp = Number(cols[14]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      data.push({
        station,
        name: station,
        lat,
        lon,
        waterTempC: Number.isFinite(wtmp) && wtmp < 90 ? wtmp : null,
        waveHeightM: Number.isFinite(wvht) && wvht < 90 ? wvht : null,
        time: "latest",
      });
    }
    if (data.length === 0) throw new Error("no rows parsed");
    return { data, live: true };
  } catch {
    return { data: NOAA_FALLBACK, live: false };
  }
}

function haversineKm(a: [number, number], b: [number, number]) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Nearest buoy (by great-circle distance) to a [lon, lat] coordinate, plus the distance in km. */
export function nearestBuoy(coord: [number, number], buoys: BuoyObs[]): { buoy: BuoyObs; distanceKm: number } | null {
  let best: { buoy: BuoyObs; distanceKm: number } | null = null;
  for (const buoy of buoys) {
    const distanceKm = haversineKm(coord, [buoy.lon, buoy.lat]);
    if (!best || distanceKm < best.distanceKm) best = { buoy, distanceKm };
  }
  return best;
}

/** Granules whose bounding box overlaps a region drawn as [lon, lat] ± degMargin. */
export function granulesNearRegion(granules: Granule[], coord: [number, number], degMargin = 9): Granule[] {
  const [lon, lat] = coord;
  const minLon = lon - degMargin;
  const maxLon = lon + degMargin;
  const minLat = lat - degMargin;
  const maxLat = lat + degMargin;
  return granules.filter((g) => {
    if (!g.bbox) return false;
    const parts = g.bbox.split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [gMinLon, gMinLat, gMaxLon, gMaxLat] = parts;
    return gMinLon <= maxLon && gMaxLon >= minLon && gMinLat <= maxLat && gMaxLat >= minLat;
  });
}
