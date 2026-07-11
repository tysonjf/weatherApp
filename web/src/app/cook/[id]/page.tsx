"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CookChart } from "@/components/CookChart";
import { trpc } from "@/lib/trpc";

const fmtTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function CookPage() {
  const params = useParams<{ id: string }>();
  const cookId = Number(params.id);
  const utils = trpc.useUtils();

  const series = trpc.readings.series.useQuery(
    { cookId },
    { enabled: Number.isFinite(cookId), refetchInterval: 60_000 },
  );
  const noteList = trpc.notes.list.useQuery({ cookId }, { enabled: Number.isFinite(cookId) });

  const addNote = trpc.notes.add.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate({ cookId });
      setText("");
      setSelectedTs(null);
    },
  });
  const removeNote = trpc.notes.remove.useMutation({
    onSuccess: () => utils.notes.list.invalidate({ cookId }),
  });
  const endCook = trpc.cooks.end.useMutation({
    onSuccess: () => {
      utils.readings.series.invalidate({ cookId });
      utils.cooks.invalidate();
    },
  });

  const [selectedTs, setSelectedTs] = useState<number | null>(null);
  const [text, setText] = useState("");

  if (!Number.isFinite(cookId)) return <p className="error">Bad cook id.</p>;
  if (series.isLoading) return <p className="muted">Loading…</p>;
  if (series.error) return <p className="error">{series.error.message}</p>;

  const { cook, points } = series.data!;
  const live = cook.endedAt == null;
  const noteTs = selectedTs ?? Date.now() / 1000;

  return (
    <>
      <p>
        <Link href="/">← All cooks</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>
          {cook.name} {live && <span className="badge">live</span>}
        </h1>
        {live && (
          <button onClick={() => endCook.mutate({ id: cook.id })} disabled={endCook.isPending}>
            End cook
          </button>
        )}
      </div>
      <p className="muted">
        Started {fmtDate(cook.startedAt)}
        {cook.endedAt != null && ` · ended ${fmtDate(cook.endedAt)}`}
        {cook.targetInternalC != null && ` · target ${cook.targetInternalC}°C`}
      </p>

      <div className="panel">
        {points.length ? (
          <CookChart
            points={points}
            notes={noteList.data ?? []}
            targetC={cook.targetInternalC}
            selectedTs={selectedTs}
            onSelectTs={setSelectedTs}
          />
        ) : (
          <p className="muted">No readings in this cook&apos;s time window yet.</p>
        )}
      </div>

      <h2>Comments</h2>
      <div className="panel">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            addNote.mutate({ cookId, ts: noteTs, text: text.trim() });
          }}
        >
          <span className="muted">
            at {fmtTime(noteTs)}
            {selectedTs == null && " (now — or click the graph to pick a time)"}
          </span>
          <input
            style={{ flex: 1, minWidth: 220 }}
            placeholder="e.g. added more wood to fire"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="primary" disabled={addNote.isPending}>
            Add comment
          </button>
          {selectedTs != null && (
            <button type="button" onClick={() => setSelectedTs(null)}>
              Use “now” instead
            </button>
          )}
        </form>
        {addNote.error && <p className="error">{addNote.error.message}</p>}

        {noteList.data?.length ? (
          <ul className="note-list" style={{ marginTop: 12 }}>
            {noteList.data.map((n) => (
              <li key={n.id}>
                <span className="time">{fmtTime(n.ts)}</span>
                <span style={{ flex: 1 }}>{n.text}</span>
                <button
                  onClick={() => removeNote.mutate({ id: n.id })}
                  disabled={removeNote.isPending}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ marginTop: 12 }}>
            No comments yet.
          </p>
        )}
      </div>
    </>
  );
}
