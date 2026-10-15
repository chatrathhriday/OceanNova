import type { Metadata } from "next";
import { DemoClient } from "./DemoClient";

export const metadata: Metadata = {
  title: "OCEANNOVA — Live Demo & Database",
  description:
    "Generate demo ocean anomaly data into PostgreSQL and preview the OCEANNOVA detection feed.",
};

function maskedDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return "postgresql://<not-configured>";
  // hide the password segment: postgresql://user:****@host:port/db
  return url.replace(/:\/\/([^:/]+):[^@]+@/, "://$1:••••@");
}

export default function DemoPage() {
  return <DemoClient dbUrl={maskedDatabaseUrl()} />;
}
