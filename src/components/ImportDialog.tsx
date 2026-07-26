"use client";

import { useState } from "react";
import type { CalendarSnapshot } from "@/lib/types";
import { useFestival } from "./Provider";

const FILTER_KEY = "ref-filter";

export function ImportDialog({ snapshot }: { snapshot: CalendarSnapshot }) {
  const { engine } = useFestival();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(snapshot.calendarName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function doImport() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { tagIds } = await engine.importSnapshot(snapshot, name.trim());
      localStorage.setItem(FILTER_KEY, JSON.stringify(tagIds));
      // Hard navigation: guarantees the dialog unmounts and the planner boots
      // from the freshly written IndexedDB state (served by the SW offline).
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setBusy(false);
    }
  }

  const bands = new Set(snapshot.assignments.map((a) => a.concertId)).size;

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-auto w-[min(92vw,26rem)] border border-white/10 bg-bg-raised p-6 text-ink"
    >
      <h2 className="font-display text-2xl">Import this calendar?</h2>
      <p className="mt-2 font-cond text-sm text-muted">
        <span className="text-ink">{snapshot.ownerName}</span> shared{" "}
        <span className="text-ink">“{snapshot.calendarName}”</span> —{" "}
        {snapshot.tags.length} tag{snapshot.tags.length !== 1 && "s"}, {bands}{" "}
        concert{bands !== 1 && "s"}. Importing adds the tags and picks to your
        own planner (kept on this device until you sign in).
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {snapshot.tags.map((t) => (
          <span
            key={t.slug}
            className="rough-bg-sm px-2 py-0.5 font-cond text-xs font-semibold uppercase text-black"
            style={{ "--block-bg": t.color } as React.CSSProperties}
          >
            {t.name}
          </span>
        ))}
      </div>

      <label className="mt-5 block font-cond text-xs uppercase tracking-widest text-muted">
        Save it as
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
          className="mt-1 w-full border border-white/10 bg-black/30 px-3 py-2 text-base text-ink outline-none focus:border-[var(--stage-magenta)]"
        />
      </label>

      {error && <p className="mt-3 text-sm text-clash">{error}</p>}

      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={() => setOpen(false)}
          className="font-cond uppercase text-muted hover:text-ink"
        >
          Just browse
        </button>
        <button
          disabled={busy || !name.trim()}
          onClick={() => void doImport()}
          className="rough-bg-sm [--block-bg:var(--stage-green)] px-4 py-2 font-cond font-bold uppercase text-black disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </dialog>
  );
}
