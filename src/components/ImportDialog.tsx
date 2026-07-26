"use client";

import { useState } from "react";
import type { CalendarSnapshot } from "@/lib/types";
import { useFestival } from "./Provider";
import { Sheet, SheetTitle, useSheetClose } from "./Sheet";

const FILTER_KEY = "ref-filter";

export function ImportDialog({ snapshot }: { snapshot: CalendarSnapshot }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Sheet onClose={() => setOpen(false)} labelledBy="import-title">
      <ImportBody snapshot={snapshot} />
    </Sheet>
  );
}

function ImportBody({ snapshot }: { snapshot: CalendarSnapshot }) {
  const { engine } = useFestival();
  const close = useSheetClose();
  const [name, setName] = useState(snapshot.calendarName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <>
      <SheetTitle id="import-title" actionLabel="Just browse">
        Import this calendar?
      </SheetTitle>
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
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-base text-ink outline-none focus:border-[var(--stage-magenta)]"
        />
      </label>

      {error && <p className="mt-3 text-sm text-clash">{error}</p>}

      <div className="mt-5 flex justify-end gap-3">
        <button onClick={close} className="font-cond uppercase text-muted hover:text-ink">
          Just browse
        </button>
        <button
          disabled={busy || !name.trim()}
          onClick={() => void doImport()}
          className="rough-bg-sm [--block-bg:var(--stage-green)] px-4 py-2.5 font-cond font-bold uppercase text-black disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </>
  );
}
