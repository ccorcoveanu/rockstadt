"use client";

import { useState } from "react";
import type { SavedCalendar } from "@/lib/types";
import { useFestival } from "./Provider";
import { Sheet, SheetTitle } from "./Sheet";

export function CalendarBar({
  filter,
  onApply,
}: {
  filter: Set<string>;
  onApply: (tagIds: Set<string>) => void;
}) {
  const { state, engine } = useFestival();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<SavedCalendar | null>(null);

  const activeCalendarId = state.calendars.find(
    (c) =>
      c.tagIds.length === filter.size && c.tagIds.every((t) => filter.has(t))
  )?.id;

  async function save() {
    if (!name.trim() || filter.size === 0) return;
    setError(null);
    try {
      await engine.saveCalendar(name.trim(), [...filter]);
      setName("");
      setSaving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="font-cond text-xs font-semibold uppercase tracking-[0.25em] text-muted">
        My calendars
      </span>

      {state.calendars.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] pr-1.5"
        >
          <button
            onClick={() => onApply(new Set(c.tagIds))}
            className={`rough-bg-sm px-3 py-2 font-cond text-sm font-semibold uppercase tracking-wide ${
              c.id === activeCalendarId
                ? "[--block-bg:var(--ink)] text-bg"
                : "[--block-bg:var(--bg-raised)] text-ink/90 hover:text-ink"
            }`}
          >
            {c.name}
            {c.shareEnabled && <span className="ml-1.5 text-xs opacity-70">⛓</span>}
          </button>
          <button
            title={c.isDefault ? "Default calendar (shown on open)" : "Make default"}
            onClick={() => void engine.setDefaultCalendar(c.id, !c.isDefault)}
            className={`min-w-10 px-2 py-2 text-lg leading-none ${
              c.isDefault ? "text-gold" : "text-muted hover:text-gold"
            }`}
          >
            {c.isDefault ? "★" : "☆"}
          </button>
          <button
            title="Share"
            onClick={() => setSharing(c)}
            className="min-w-10 px-2 py-2 text-base leading-none text-muted hover:text-[var(--stage-magenta)]"
          >
            ↗
          </button>
          <button
            title="Delete"
            onClick={() => {
              if (confirm(`Delete calendar "${c.name}"? Tags stay.`)) {
                void engine.removeCalendar(c.id);
              }
            }}
            className="min-w-10 px-2 py-2 text-base leading-none text-muted hover:text-clash"
          >
            ✕
          </button>
        </span>
      ))}

      {filter.size > 0 && !activeCalendarId && (
        <>
          {saving ? (
            <span className="inline-flex items-center gap-1.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                  if (e.key === "Escape") setSaving(false);
                }}
                placeholder="Calendar name"
                maxLength={128}
                className="w-40 border border-white/10 bg-black/30 px-2 py-1 font-cond text-sm outline-none focus:border-[var(--stage-magenta)]"
              />
              <button
                onClick={() => void save()}
                className="rough-bg-sm [--block-bg:var(--stage-green)] px-2.5 py-1 font-cond text-sm font-bold uppercase text-black"
              >
                Save
              </button>
            </span>
          ) : (
            <button
              onClick={() => setSaving(true)}
              className="font-cond text-xs font-semibold uppercase tracking-wider text-gold hover:brightness-125"
            >
              + save this selection as calendar
            </button>
          )}
        </>
      )}

      {state.calendars.length === 0 && filter.size === 0 && (
        <span className="font-cond text-xs text-muted">
          pick tags above, then save the selection as a named calendar
        </span>
      )}
      {error && <span className="text-sm text-clash">{error}</span>}

      {sharing && <ShareDialog calendar={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}

function ShareDialog({
  calendar,
  onClose,
}: {
  calendar: SavedCalendar;
  onClose: () => void;
}) {
  const { state, engine } = useFestival();
  const live = state.calendars.find((c) => c.id === calendar.id) ?? calendar;
  const [url, setUrl] = useState<string | null>(
    live.shareEnabled && live.shareToken
      ? `${window.location.origin}/c/${live.shareToken}`
      : null
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const nextUrl = await engine.setCalendarSharing(live.id, enabled);
      setUrl(nextUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sharing failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="share-title">
      <SheetTitle id="share-title">Share “{live.name}”</SheetTitle>

      <p className="mt-2 font-cond text-sm text-muted">
        Anyone with the link can import this calendar — your selected tags and
        the concerts you tagged with them.{" "}
        {state.user
          ? "The link stays live: it always serves your current picks. Turn it off any time."
          : "Without an account the link carries a frozen copy of your picks as they are right now — disable and share again after changes, or sign in for a live link."}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={busy}
          onClick={() => void toggle(!url)}
          className={`rough-bg-sm px-3 py-1.5 font-cond text-sm font-bold uppercase disabled:opacity-50 ${
            url
              ? "[--block-bg:var(--clash)] text-white"
              : "[--block-bg:var(--stage-green)] text-black"
          }`}
        >
          {busy ? "…" : url ? "Disable link" : "Create share link"}
        </button>
      </div>

      {url && (
        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-2.5 font-mono text-xs text-ink/90"
          />
          <button
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="rough-bg-sm [--block-bg:var(--stage-magenta)] shrink-0 px-3 py-2.5 font-cond text-sm font-bold uppercase text-white"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={() => {
                void navigator
                  .share({ title: `REF 2026 — ${live.name}`, url })
                  .catch(() => undefined);
              }}
              className="rough-bg-sm [--block-bg:var(--stage-green)] shrink-0 px-3 py-2.5 font-cond text-sm font-bold uppercase text-black"
            >
              Share…
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-clash">{error}</p>}
    </Sheet>
  );
}
