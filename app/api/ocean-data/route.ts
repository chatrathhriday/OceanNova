import { NextResponse } from "next/server";

/**
 * Live ocean-data feed for the "Powered by Innovation" section.
 *
 * Pulls from real, public, no-auth government endpoints server-side:
 *   - NASA PACE — most recent OCI L2 granule metadata via the NASA CMR
 *     (Common Metadata Repository) search API. This is the same catalog
 *     backing https://search.earthdata.nasa.gov. Full L2 granule *pixels*
 *     require an Earthdata login + Python (xarray/netCDF4/earthaccess) and
 *     run in the OCEANNOVA model backend, not in the browser — here we
 *     surface the live granule listing (id, time, coverage) so the site
 *     reflects what the model is currently ingesting.
 *   - NOAA — latest buoy sea-surface observations via NOAA NDBC / CO-OPS.
 *
 * Every source is wrapped in try/catch and falls back to representative
 * values so the section always renders.
 */

export const revalidate = 900; // 15 min

type Granule = {
  id: string;
  title: string;
  timeStart: string;
  timeEnd: string;
  bbox: string | null;
};

type BuoyObs = {
  station: string;
  name: string;
  lat: number;
  lon: number;
  waterTempC: number | null;
  waveHeightM: number | null;
  time: string;
};

const PACE_FALLBACK: Granule[] = [
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

const NOAA_FALLBACK: BuoyObs[] = [
  { station: "41008", name: "Grays Reef, GA", lat: 31.4, lon: -80.87, waterTempC: 27.3, waveHeightM: 1.1, time: "recent" },
  { station: "46042", name: "Monterey Bay, CA", lat: 36.79, lon: -122.4, waterTempC: 14.8, waveHeightM: 2.4, time: "recent" },
  { station: "51001", name: "NW Hawaii", lat: 24.45, lon: -162.0, waterTempC: 25.9, waveHeightM: 2.0, time: "recent" },
];

async function fetchPaceGranules(): Promise<{ data: Granule[]; live: boolean }> {
  try {
    const url =
      "https://cmr.earthdata.nasa.gov/search/granules.json" +
      "?short_name=PACE_OCI_L2_BGC&sort_key=-start_date&page_size=6";
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
    const data: Granule[] = entries.slice(0, 6).map((e) => {
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
    return { data: [], live: false };
  }
}

async function fetchNoaaBuoys(): Promise<{ data: BuoyObs[]; live: boolean }> {
  // NOAA CO-OPS water temperature for a few coastal stations.
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
    return { data: [], live: false };
  }
}

export async function GET() {
  const [pace, noaa] = await Promise.all([fetchPaceGranules(), fetchNoaaBuoys()]);

  const tempReadings = noaa.data.map((b) => b.waterTempC).filter((v): v is number => v != null);
  const avgTemp =
    tempReadings.length > 0
      ? Number((tempReadings.reduce((a, b) => a + b, 0) / tempReadings.length).toFixed(1))
      : null;

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    pace: {
      source: "NASA Earthdata CMR — PACE_OCI_L2_BGC",
      live: pace.live,
      granules: pace.data,
    },
    noaa: {
      source: "NOAA CO-OPS — water temperature",
      live: noaa.live,
      stations: noaa.data,
      avgWaterTempC: avgTemp,
    },
    hab: {
      source: "NOAA NCCOS Harmful Algal Bloom bulletins",
      note: "HAB forecast bulletins are published per-region by NOAA NCCOS; cross-checked by the model backend against PACE chlorophyll anomalies.",
    },
  });
}
