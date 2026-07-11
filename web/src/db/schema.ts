import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Mirrors the shape the Python logger uploads (all temps °C, unix-epoch seconds).
export const readings = sqliteTable(
  "readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // UNIQUE so retried uploads are idempotent (the uploader re-sends a batch
    // whenever it isn't sure the previous POST landed).
    ts: real("ts").notNull(),
    probe1Internal: real("probe1_internal"),
    probe1Ambient: real("probe1_ambient"),
    probe2Internal: real("probe2_internal"),
    probe2Ambient: real("probe2_ambient"),
    baseAmbient: real("base_ambient"),
    battBase: integer("batt_base"),
    battProbe1: integer("batt_probe1"),
    battProbe2: integer("batt_probe2"),
  },
  (t) => [uniqueIndex("idx_readings_ts").on(t.ts)],
);

export const cooks = sqliteTable("cooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  meatType: text("meat_type"),
  targetInternalC: real("target_internal_c"),
  probe: integer("probe").notNull().default(1),
  startedAt: real("started_at").notNull(),
  endedAt: real("ended_at"),
});

// Timestamped annotations shown on the cook graph ("added more wood to fire").
export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cookId: integer("cook_id")
      .notNull()
      .references(() => cooks.id, { onDelete: "cascade" }),
    ts: real("ts").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("idx_notes_cook").on(t.cookId)],
);

export type Reading = typeof readings.$inferSelect;
export type Cook = typeof cooks.$inferSelect;
export type Note = typeof notes.$inferSelect;
