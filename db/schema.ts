import { pgTable, serial, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";

export const anomalies = pgTable("anomalies", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  parameter: text("parameter").notNull(),
  severity: text("severity").notNull().default("medium"), // low | medium | high
  region: text("region").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  value: doublePrecision("value").notNull(),
  deviation: doublePrecision("deviation").notNull(),
  confidence: doublePrecision("confidence").notNull().default(0.8),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Anomaly = typeof anomalies.$inferSelect;
