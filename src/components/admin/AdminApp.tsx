"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { DAY_LABELS, fmtTime } from "@/lib/time";
import type { Concert, Schedule, Tag } from "@/lib/types";

// Admin edits festival-local times (EEST, UTC+3); sets past midnight belong to
// the *next* calendar date relative to the festival day.
function toIso(dayDate: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dayDate}T00:00:00+03:00`);
  if (h < 5) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(h - 3, m, 0, 0);
  return d.toISOString();
}

export function AdminApp({
  schedule: initialSchedule,
  globalTags: initialTags,
  adminName,
}: {
  schedule: Schedule;
  globalTags: Tag[];
  adminName: string;
}) {
  const [schedule, setSchedule] = useState(initialSchedule);
  const [tags, setTags] = useState(initialTags);
  const [day, setDay] = useState(1);
  const [editing, setEditing] = useState<Concert | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dayConcerts = useMemo(
    () =>
      schedule.concerts
        .filter((c) => c.day === day)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [schedule, day]
  );

  async function reloadSchedule() {
    const fresh = await fetch("/api/schedule").then((r) => r.json());
    setSchedule(fresh);
  }

  async function removeConcert(c: Concert) {
    if (!confirm(`Delete "${c.band}" and every user's tags on it?`)) return;
    try {
      await api.adminDeleteConcert(c.id);
      await reloadSchedule();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-3xl">Admin</h1>
        <span className="font-cond text-sm text-muted">{adminName}</span>
        <Link href="/" className="ml-auto font-cond text-sm uppercase text-muted hover:text-ink">
          ← back to planner
        </Link>
      </div>
      {error && (
        <p className="mt-4 border-l-2 border-clash pl-3 text-sm text-clash">{error}</p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl">Global tags</h2>
        <GlobalTags tags={tags} onChange={setTags} onError={setError} />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl">Schedule</h2>
          <div className="ml-auto flex gap-1">
            {Object.entries(DAY_LABELS).map(([d, meta]) => (
              <button
                key={d}
                onClick={() => setDay(Number(d))}
                className={`px-3 py-1.5 font-cond text-sm font-semibold uppercase ${
                  Number(d) === day ? "bg-ink text-bg" : "bg-bg-raised text-muted hover:text-ink"
                }`}
              >
                {meta.title}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditing("new")}
            className="rough-bg-sm [--block-bg:var(--stage-green)] px-3 py-1.5 font-cond text-sm font-bold uppercase text-black"
          >
            + Add set
          </button>
        </div>

        <table className="mt-4 w-full border-collapse font-cond">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-muted">
              <th className="py-2 pr-2">Time</th>
              <th className="py-2 pr-2">Band</th>
              <th className="py-2 pr-2">Stage</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {dayConcerts.map((c) => {
              const stage = schedule.stages.find((s) => s.id === c.stageId);
              return (
                <tr key={c.id} className="border-b border-white/5">
                  <td className="py-2 pr-2 tabular-nums">
                    {fmtTime(c.startsAt)}–{fmtTime(c.endsAt)}
                    {c.openEnded && "~"}
                  </td>
                  <td className="py-2 pr-2 font-semibold">{c.band}</td>
                  <td className="py-2 pr-2">
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: stage?.color }}
                    />
                    {stage?.name}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setEditing(c)}
                      className="mr-3 text-sm uppercase text-muted hover:text-ink"
                    >
                      edit
                    </button>
                    <button
                      onClick={() => void removeConcert(c)}
                      className="text-sm uppercase text-clash/80 hover:text-clash"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {editing && (
        <ConcertEditor
          concert={editing === "new" ? null : editing}
          day={day}
          stages={schedule.stages}
          onDone={async (changed) => {
            setEditing(null);
            if (changed) await reloadSchedule();
          }}
          onError={setError}
        />
      )}
    </main>
  );
}

function GlobalTags({
  tags,
  onChange,
  onError,
}: {
  tags: Tag[];
  onChange: (t: Tag[]) => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#e3b341");

  async function run<T>(fn: () => Promise<T>) {
    onError(null);
    try {
      return await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Request failed");
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {tags.map((t) => (
        <div key={t.id} className="flex items-center gap-3">
          <input
            type="color"
            defaultValue={t.color}
            onBlur={(e) => {
              const c = e.target.value;
              if (c !== t.color)
                void run(async () => {
                  const { tag } = await api.adminUpdateGlobalTag(t.id, { color: c });
                  onChange(tags.map((x) => (x.id === t.id ? tag : x)));
                });
            }}
            className="h-7 w-9 cursor-pointer border-0 bg-transparent"
          />
          <input
            defaultValue={t.name}
            onBlur={(e) => {
              const n = e.target.value.trim();
              if (n && n !== t.name)
                void run(async () => {
                  const { tag } = await api.adminUpdateGlobalTag(t.id, { name: n });
                  onChange(tags.map((x) => (x.id === t.id ? tag : x)));
                });
            }}
            className="border border-white/10 bg-black/30 px-2 py-1 font-cond font-semibold uppercase"
          />
          <button
            onClick={() =>
              confirm(`Delete global tag "${t.name}"? Removes it from every user.`) &&
              void run(async () => {
                await api.adminDeleteGlobalTag(t.id);
                onChange(tags.filter((x) => x.id !== t.id));
              })
            }
            className="font-cond text-sm uppercase text-clash/80 hover:text-clash"
          >
            delete
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-9 cursor-pointer border-0 bg-transparent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New global tag"
          className="border border-white/10 bg-black/30 px-2 py-1"
        />
        <button
          onClick={() => {
            if (!name.trim()) return;
            void run(async () => {
              const { tag } = await api.adminCreateGlobalTag(name.trim(), color);
              onChange([...tags, tag]);
              setName("");
            });
          }}
          className="rough-bg-sm [--block-bg:var(--stage-green)] px-3 py-1 font-cond text-sm font-bold uppercase text-black"
        >
          Add
        </button>
      </div>
    </div>
  );
}

const DAY_DATES: Record<number, string> = {
  1: "2026-07-27",
  2: "2026-07-28",
  3: "2026-07-29",
  4: "2026-07-30",
  5: "2026-07-31",
  6: "2026-08-01",
};

function ConcertEditor({
  concert,
  day,
  stages,
  onDone,
  onError,
}: {
  concert: Concert | null;
  day: number;
  stages: Schedule["stages"];
  onDone: (changed: boolean) => void;
  onError: (e: string | null) => void;
}) {
  const [form, setForm] = useState({
    band: concert?.band ?? "",
    stageId: concert?.stageId ?? stages[0]?.id ?? "",
    day: concert?.day ?? day,
    start: concert ? fmtTime(concert.startsAt) : "18:00",
    end: concert ? fmtTime(concert.endsAt) : "19:00",
    openEnded: concert?.openEnded ?? false,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    onError(null);
    const date = DAY_DATES[form.day];
    const payload = {
      band: form.band.trim(),
      stageId: form.stageId,
      day: form.day,
      date,
      startsAt: toIso(date, form.start),
      endsAt: toIso(date, form.end),
      openEnded: form.openEnded,
    };
    try {
      if (concert) await api.adminUpdateConcert(concert.id, payload);
      else await api.adminCreateConcert(payload);
      onDone(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  const input =
    "w-full border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-[var(--stage-magenta)]";

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-auto w-[min(92vw,26rem)] border border-white/10 bg-bg-raised p-6 text-ink"
    >
      <h3 className="font-display text-xl">{concert ? "Edit set" : "Add set"}</h3>
      <div className="mt-4 space-y-3">
        <input
          value={form.band}
          onChange={(e) => setForm({ ...form, band: e.target.value })}
          placeholder="Band"
          className={input}
        />
        <select
          value={form.stageId}
          onChange={(e) => setForm({ ...form, stageId: e.target.value })}
          className={input}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={form.day}
          onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}
          className={input}
        >
          {Object.entries(DAY_LABELS).map(([d, meta]) => (
            <option key={d} value={d}>
              {meta.title} — {meta.date}
            </option>
          ))}
        </select>
        <div className="flex gap-3">
          <label className="flex-1 font-cond text-xs uppercase text-muted">
            Start
            <input
              type="time"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
              className={input}
            />
          </label>
          <label className="flex-1 font-cond text-xs uppercase text-muted">
            End
            <input
              type="time"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
              className={input}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 font-cond text-sm uppercase text-muted">
          <input
            type="checkbox"
            checked={form.openEnded}
            onChange={(e) => setForm({ ...form, openEnded: e.target.checked })}
          />
          Open-ended (no fixed end)
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={() => onDone(false)}
          className="font-cond uppercase text-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          disabled={busy || !form.band.trim()}
          onClick={() => void save()}
          className="rough-bg-sm [--block-bg:var(--stage-magenta)] px-4 py-2 font-cond font-bold uppercase text-white disabled:opacity-50"
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
    </dialog>
  );
}
