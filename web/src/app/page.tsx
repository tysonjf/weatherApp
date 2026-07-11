"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

const fmtTemp = (c: number | null | undefined) =>
  c == null ? "—" : `${c.toFixed(1)}°C`;

const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function Home() {
  const utils = trpc.useUtils();
  const live = trpc.live.useQuery(undefined, { refetchInterval: 30_000 });
  const cookList = trpc.cooks.list.useQuery();
  const start = trpc.cooks.start.useMutation({
    onSuccess: () => utils.cooks.list.invalidate(),
  });

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  const latest = live.data?.latest;
  const stale = live.data?.staleSeconds;
  const active = cookList.data?.find((c) => c.endedAt == null);

  return (
    <>
      <h1>BBQ Temps</h1>
      <p className="muted">Inkbird INT-12-BW &middot; updated every 30 s</p>

      <div className="panel">
        {latest ? (
          <>
            <div className="temp-grid">
              <div className="cell">
                <div className="value">{fmtTemp(latest.probe1Internal)}</div>
                <div className="label">Probe 1 · meat</div>
              </div>
              <div className="cell">
                <div className="value">{fmtTemp(latest.probe1Ambient)}</div>
                <div className="label">Probe 1 · pit</div>
              </div>
              {latest.probe2Internal != null && (
                <div className="cell">
                  <div className="value">{fmtTemp(latest.probe2Internal)}</div>
                  <div className="label">Probe 2 · meat</div>
                </div>
              )}
              {latest.probe2Ambient != null && (
                <div className="cell">
                  <div className="value">{fmtTemp(latest.probe2Ambient)}</div>
                  <div className="label">Probe 2 · pit</div>
                </div>
              )}
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Last reading {fmtDate(latest.ts)}
              {stale != null && stale > 120 && ` — ${Math.round(stale / 60)} min ago, logger may be offline`}
            </p>
          </>
        ) : (
          <p className="muted">
            {live.isLoading ? "Loading…" : "No readings yet — start the logger with --upload-url."}
          </p>
        )}
      </div>

      <h2>Cooks</h2>
      {!active && (
        <div className="panel">
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              start.mutate({
                name: name.trim(),
                targetInternalC: target ? Number(target) : undefined,
              });
              setName("");
            }}
          >
            <input
              placeholder="Cook name (e.g. brisket)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              placeholder="Target °C (optional)"
              type="number"
              min={0}
              max={150}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              style={{ width: 140 }}
            />
            <button className="primary" disabled={start.isPending}>
              Start cook
            </button>
          </form>
          {start.error && <p className="error">{start.error.message}</p>}
        </div>
      )}

      <div className="panel">
        {cookList.data?.length ? (
          <ul className="cook-list">
            {cookList.data.map((c) => (
              <li key={c.id}>
                <span>
                  <Link href={`/cook/${c.id}`}>{c.name}</Link>{" "}
                  {c.endedAt == null && <span className="badge">live</span>}
                </span>
                <span className="muted">{fmtDate(c.startedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{cookList.isLoading ? "Loading…" : "No cooks yet."}</p>
        )}
      </div>
    </>
  );
}
