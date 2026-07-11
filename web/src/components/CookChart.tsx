"use client";

// Cook temperature graph. Click anywhere on the chart to pick a moment, then
// add a comment ("added more wood to fire") — comments render as labelled
// vertical lines on the graph.

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Note } from "@/db/schema";
import type { SeriesPoint } from "@/server/router";

const fmtTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const LINES: { key: keyof SeriesPoint; name: string; color: string; dash?: string }[] = [
  { key: "probe1Internal", name: "Meat 1", color: "#e8632c" },
  { key: "probe1Ambient", name: "Pit 1", color: "#e8b02c", dash: "5 4" },
  { key: "probe2Internal", name: "Meat 2", color: "#5ea8e8" },
  { key: "probe2Ambient", name: "Pit 2", color: "#8fd18b", dash: "5 4" },
];

export function CookChart({
  points,
  notes,
  targetC,
  selectedTs,
  onSelectTs,
}: {
  points: SeriesPoint[];
  notes: Note[];
  targetC: number | null;
  selectedTs: number | null;
  onSelectTs: (ts: number) => void;
}) {
  const used = LINES.filter((l) => points.some((p) => p[l.key] != null));

  return (
    <div style={{ width: "100%", height: 380 }}>
      <ResponsiveContainer>
        <LineChart
          data={points}
          margin={{ top: 20, right: 12, bottom: 4, left: 0 }}
          onClick={(e) => {
            const ts = Number(e?.activeLabel);
            if (Number.isFinite(ts)) onSelectTs(ts);
          }}
        >
          <CartesianGrid stroke="#383025" strokeDasharray="3 3" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtTime}
            stroke="#9c8f7d"
          />
          <YAxis unit="°" stroke="#9c8f7d" width={44} domain={["auto", "auto"]} />
          <Tooltip
            labelFormatter={(ts) => fmtTime(Number(ts))}
            formatter={(v) => (typeof v === "number" ? `${v.toFixed(1)}°C` : "—")}
            contentStyle={{ background: "#211c16", border: "1px solid #383025", borderRadius: 8 }}
          />
          <Legend />
          {targetC != null && (
            <ReferenceLine
              y={targetC}
              stroke="#e86a5e"
              strokeDasharray="6 4"
              label={{ value: `target ${targetC}°`, fill: "#e86a5e", fontSize: 11, position: "right" }}
            />
          )}
          {notes.map((n) => (
            <ReferenceLine
              key={n.id}
              x={n.ts}
              stroke="#9c8f7d"
              label={{
                value: n.text.length > 18 ? `${n.text.slice(0, 17)}…` : n.text,
                angle: -90,
                position: "insideTopLeft",
                fill: "#efe7db",
                fontSize: 11,
                dx: -4,
              }}
            />
          ))}
          {selectedTs != null && <ReferenceLine x={selectedTs} stroke="#e8632c" strokeWidth={2} />}
          {used.map((l) => (
            <Line
              key={l.key}
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeDasharray={l.dash}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
