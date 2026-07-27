"use client";

import { useMemo, useRef, useState } from "react";
import type { Concert } from "@/lib/types";
import { DAY_LABELS, fmtRange } from "@/lib/time";
import { useFestival } from "./Provider";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export function BandSearch({ onPick }: { onPick: (c: Concert) => void }) {
  const { state } = useFestival();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const needle = fold(q.trim());
    if (needle.length < 2 || !state.schedule) return [];
    return state.schedule.concerts
      .filter((c) => fold(c.band).includes(needle))
      .slice(0, 8);
  }, [q, state.schedule]);

  const stageOf = (id: string) => state.schedule?.stages.find((s) => s.id === id);

  return (
    <div className="relative mb-4">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQ("")}
        placeholder="🔍  Search a band to tag it…"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 font-cond text-base outline-none placeholder:text-muted focus:border-[var(--stage-magenta)]"
      />
      {q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-white/10 bg-bg-raised shadow-2xl">
          {results.length === 0 && (
            <p className="px-3 py-3 font-cond text-sm text-muted">
              No band matches “{q.trim()}”.
            </p>
          )}
          {results.map((c) => {
            const stage = stageOf(c.stageId);
            return (
              <button
                key={c.id}
                onClick={() => {
                  setQ("");
                  onPick(c);
                }}
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/5"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded"
                  style={{ background: stage?.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-display block truncate text-base leading-tight">
                    {c.band}
                  </span>
                  <span className="font-cond block text-xs uppercase tracking-wider text-muted">
                    {DAY_LABELS[c.day].title} · {DAY_LABELS[c.day].date} ·{" "}
                    {stage?.name} · {fmtRange(c)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
