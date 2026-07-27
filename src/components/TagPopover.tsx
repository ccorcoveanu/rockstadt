"use client";

import type { Concert } from "@/lib/types";
import { DAY_LABELS, fmtRange } from "@/lib/time";
import { useActiveTagIds, useFestival } from "./Provider";
import { Sheet } from "./Sheet";

export function TagPopover({
  concert,
  stageName,
  stageColor,
  clashingWith,
  onClose,
}: {
  concert: Concert;
  stageName: string;
  stageColor: string;
  clashingWith: Concert[];
  onClose: () => void;
}) {
  const { state, engine } = useFestival();
  const active = useActiveTagIds(concert.id);

  return (
    <Sheet onClose={onClose} labelledBy="tag-popover-title">
      <div
        id="tag-popover-title"
        className="rough-bg -mx-1 px-3 py-2 font-display text-xl text-white"
        style={{ "--block-bg": stageColor } as React.CSSProperties}
      >
        {concert.band}
      </div>
      <p className="mt-2 font-cond text-sm uppercase tracking-wider text-muted">
        <span className="text-gold">
          {DAY_LABELS[concert.day].title} · {DAY_LABELS[concert.day].date}
        </span>{" "}
        · {stageName} · {fmtRange(concert)}
        {concert.openEnded && " (open end)"}
      </p>

      {clashingWith.length > 0 && (
        <p className="mt-2 border-l-2 border-clash pl-2 font-cond text-sm text-clash">
          Clashes with {clashingWith.map((c) => c.band).join(", ")}
        </p>
      )}

      <p className="mt-4 font-cond text-xs font-semibold uppercase tracking-[0.25em] text-muted">
        Tag it
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {state.tags.map((t) => {
          const on = active.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => void engine.toggleTag(concert.id, t.id)}
              data-on={on}
              style={
                {
                  "--chip": t.color,
                  "--block-bg": on
                    ? t.color
                    : `color-mix(in srgb, ${t.color} 26%, #171024)`,
                } as React.CSSProperties
              }
              className={`tag-chip rough-bg-sm px-3 py-2 font-cond text-sm font-semibold uppercase tracking-wide ${
                on ? "text-black" : "text-ink/90"
              }`}
            >
              {on ? "✓ " : ""}
              {t.name}
            </button>
          );
        })}
      </div>
      {!state.user && (
        <p className="mt-4 text-xs text-muted">
          Saved on this device. Sign in to sync across devices.
        </p>
      )}
    </Sheet>
  );
}
