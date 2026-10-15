import type { Metadata } from "next";
import Link from "next/link";
import { AnomalyWorldMap } from "./AnomalyWorldMap";
import { ModelWorkspace } from "./ModelWorkspace";

export const metadata: Metadata = {
  title: "OCEANNOVA — Live Model Workspace",
  description:
    "The OCEANNOVA detection model running live: continuously ingesting NASA PACE OCI L2 granules and NOAA ocean data, then detecting, explaining and classifying ocean anomalies.",
};

type ModelPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function ModelPage({ searchParams }: ModelPageProps) {
  const { view } = await searchParams;

  if (view === "scientific") {
    return <ModelWorkspace />;
  }

  return (
    <main className="min-h-screen bg-abyssal-navy">
      <div className="mx-auto flex max-w-[1600px] justify-end px-5 pt-4 md:px-8">
        <Link
          href="/model?view=scientific"
          className="rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-silver/70 transition hover:border-bio-cyan/60 hover:text-bio-cyan"
        >
          Open scientific evidence view
        </Link>
      </div>
      <AnomalyWorldMap />
    </main>
  );
}
