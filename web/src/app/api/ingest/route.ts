// Receives batches from `inkbird-logger --upload-url https://<app>/api/ingest`.
//
// Auth: `Authorization: Bearer $INKBIRD_UPLOAD_TOKEN` (set via `wrangler secret put`).
// Body: {"source": "inkbird-logger", "readings": [{ts, probe1_internal, ...}, ...]}
// Inserts are deduped on ts, so the uploader can retry a batch safely.

import { NextResponse } from "next/server";
import { getDb, getEnv } from "@/db";
import { readings } from "@/db/schema";

const NUM = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// D1 allows at most 100 bound parameters per statement; 10 rows × 9 columns fits.
const CHUNK = 10;

export async function POST(req: Request) {
  const env = await getEnv();
  const token = env.INKBIRD_UPLOAD_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { readings?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const batch = Array.isArray(body.readings) ? body.readings : null;
  if (!batch || batch.length > 1000) {
    return NextResponse.json({ error: "expected readings: [...] (max 1000)" }, { status: 400 });
  }

  const rows = batch.flatMap((raw) => {
    const r = raw as Record<string, unknown>;
    const ts = NUM(r.ts);
    if (ts === null) return [];
    return [{
      ts,
      probe1Internal: NUM(r.probe1_internal),
      probe1Ambient: NUM(r.probe1_ambient),
      probe2Internal: NUM(r.probe2_internal),
      probe2Ambient: NUM(r.probe2_ambient),
      baseAmbient: NUM(r.base_ambient),
      battBase: NUM(r.batt_base),
      battProbe1: NUM(r.batt_probe1),
      battProbe2: NUM(r.batt_probe2),
    }];
  });

  const db = await getDb();
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(readings).values(rows.slice(i, i + CHUNK)).onConflictDoNothing();
  }
  return NextResponse.json({ ok: true, received: batch.length, accepted: rows.length });
}
