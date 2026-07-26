"use client";

import { useState } from "react";
import { GLOBAL_OWNER, type Tag } from "@/lib/types";
import { useFestival } from "./Provider";

const PALETTE = [
  "#e3b341",
  "#f0483e",
  "#6abf2e",
  "#c320c9",
  "#e07020",
  "#3fa7d6",
  "#a06cd5",
  "#7d8590",
];

export function TagBar({
  filter,
  onFilterChange,
}: {
  filter: Set<string>;
  onFilterChange: (next: Set<string>) => void;
}) {
  const { state } = useFestival();
  const [managing, setManaging] = useState(false);

  function toggle(tagId: string) {
    const next = new Set(filter);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    onFilterChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-cond text-xs font-semibold uppercase tracking-[0.25em] text-muted">
          Filter by tag
        </span>
        {state.tags.map((t) => (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            data-on={filter.has(t.id)}
            style={
              {
                "--chip": t.color,
                "--block-bg": filter.has(t.id)
                  ? t.color
                  : `color-mix(in srgb, ${t.color} 26%, #171024)`,
              } as React.CSSProperties
            }
            className={`tag-chip rough-bg-sm px-3 py-1 font-cond text-sm font-semibold uppercase tracking-wide ${
              filter.has(t.id)
                ? "text-black"
                : "text-ink/90 hover:text-ink"
            }`}
          >
            {t.name}
            {t.ownerId !== GLOBAL_OWNER && <span className="ml-1 opacity-60">•</span>}
          </button>
        ))}
        {filter.size > 0 && (
          <button
            onClick={() => onFilterChange(new Set())}
            className="font-cond text-xs uppercase tracking-wider text-muted underline-offset-4 hover:underline"
          >
            clear
          </button>
        )}
        <button
          onClick={() => setManaging(true)}
          className="ml-auto font-cond text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink"
        >
          + manage tags
        </button>
      </div>
      {filter.size > 0 && (
        <p className="font-cond text-xs uppercase tracking-wider text-muted">
          Showing concerts carrying any selected tag — overlaps glow{" "}
          <span className="text-clash">red</span>. Others stay dimmed.
        </p>
      )}
      {managing && <TagManager onClose={() => setManaging(false)} />}
    </div>
  );
}

function TagManager({ onClose }: { onClose: () => void }) {
  const { state, engine } = useFestival();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const mine = state.tags.filter((t) => t.ownerId !== GLOBAL_OWNER);
  const globals = state.tags.filter((t) => t.ownerId === GLOBAL_OWNER);

  async function create() {
    if (!name.trim()) return;
    setError(null);
    try {
      await engine.createTag(name.trim(), color);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create tag");
    }
  }

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-auto w-[min(92vw,30rem)] border border-white/10 bg-bg-raised p-6 text-ink"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">Your tags</h3>
        <button onClick={onClose} className="font-cond uppercase text-muted hover:text-ink">
          close ✕
        </button>
      </div>

      <div className="mt-4 space-y-1">
        <p className="font-cond text-xs uppercase tracking-widest text-muted">
          Festival tags (everyone sees these)
        </p>
        <div className="flex flex-wrap gap-2">
          {globals.map((t) => (
            <span
              key={t.id}
              className="rough-bg-sm px-2.5 py-1 font-cond text-sm font-semibold uppercase text-black"
              style={{ "--block-bg": t.color } as React.CSSProperties}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <p className="font-cond text-xs uppercase tracking-widest text-muted">
          Mine {state.user ? "" : "(kept on this device until you sign in)"}
        </p>
        {mine.length === 0 && (
          <p className="text-sm text-muted">None yet — forge one below.</p>
        )}
        {mine.map((t) => (
          <TagRow key={t.id} tag={t} />
        ))}
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder="New tag name"
            maxLength={64}
            className="flex-1 border border-white/10 bg-black/30 px-3 py-2 outline-none placeholder:text-muted focus:border-[var(--stage-magenta)]"
          />
          <button
            onClick={() => void create()}
            className="rough-bg-sm [--block-bg:var(--stage-green)] px-4 font-cond font-bold uppercase text-black hover:brightness-110"
          >
            Add
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
              className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-white" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-clash">{error}</p>}
      </div>
    </dialog>
  );
}

function TagRow({ tag }: { tag: Tag }) {
  const { engine } = useFestival();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);

  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tag.color }} />
      {editing ? (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            className="flex-1 border border-white/10 bg-black/30 px-2 py-1 text-sm outline-none"
          />
          <button
            onClick={() => {
              void engine.updateTag(tag.id, { name: name.trim() || tag.name });
              setEditing(false);
            }}
            className="font-cond text-xs uppercase text-[var(--stage-green)]"
          >
            save
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 font-cond font-semibold uppercase tracking-wide">
            {tag.name}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="font-cond text-xs uppercase text-muted hover:text-ink"
          >
            rename
          </button>
          <button
            onClick={() => void engine.deleteTag(tag.id)}
            className="font-cond text-xs uppercase text-clash/80 hover:text-clash"
          >
            delete
          </button>
        </>
      )}
    </div>
  );
}
