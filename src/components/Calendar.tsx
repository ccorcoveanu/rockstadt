"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Concert, Stage } from "@/lib/types";
import {
  DAY_DATES,
  DAY_LABELS,
  findClashes,
  fmtRange,
  fmtTime,
  hourMarks,
  isPlaying,
  nowIntoDay,
  slotOf,
  SLOT_MIN,
  SLOTS_PER_DAY,
} from "@/lib/time";
import { useFestival } from "./Provider";
import { TagPopover } from "./TagPopover";

type BlockMeta = {
  concert: Concert;
  eligible: boolean;
  clashing: Concert[];
};

// TEMPORARY (remove after the festival starts): pretend we are 24h later so
// the live view can be tested the day before Day 1.
const DEV_TIME_SHIFT_MS = 24 * 3600_000;

// Client-only clock, ticking every 30s; null during SSR/hydration so the
// server and first client render agree. `?now=<ISO>` overrides for previews.
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("now");
    const overrideDate = override ? new Date(override) : null;
    const valid = overrideDate && !Number.isNaN(overrideDate.getTime());
    const tick = () =>
      setNow(valid ? overrideDate : new Date(Date.now() + DEV_TIME_SHIFT_MS));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Calendar({
  day,
  filter,
}: {
  day: number;
  filter: Set<string>;
}) {
  const { state } = useFestival();
  const [openConcert, setOpenConcert] = useState<Concert | null>(null);
  // Filter shows only your calendar by default; "expand" brings the rest back, dimmed.
  const [expanded, setExpanded] = useState(false);
  const hideIneligible = filter.size > 0 && !expanded;
  const now = useNow();
  const nowMinutes = now ? nowIntoDay(DAY_DATES[day], now) : null;

  const schedule = state.schedule;
  const stages: Stage[] = useMemo(() => {
    if (!schedule) return [];
    const used = new Set(
      schedule.concerts.filter((c) => c.day === day).map((c) => c.stageId)
    );
    return schedule.stages.filter((s) => used.has(s.id));
  }, [schedule, day]);

  const blocks: Map<string, BlockMeta> = useMemo(() => {
    if (!schedule) return new Map();
    const dayConcerts = schedule.concerts.filter((c) => c.day === day);
    const filterOn = filter.size > 0;
    const eligibleIds = new Set<string>();
    if (filterOn) {
      for (const a of state.assignments.values()) {
        if (a.active && filter.has(a.tagId)) eligibleIds.add(a.concertId);
      }
    }
    const eligible = dayConcerts.filter((c) => !filterOn || eligibleIds.has(c.id));
    const clashes = filterOn ? findClashes(eligible) : new Map<string, Concert[]>();
    return new Map(
      dayConcerts.map((c) => [
        c.id,
        {
          concert: c,
          eligible: !filterOn || eligibleIds.has(c.id),
          clashing: clashes.get(c.id) ?? [],
        },
      ])
    );
  }, [schedule, day, filter, state.assignments]);

  if (!schedule) return null;

  const stageOf = (id: string) => schedule.stages.find((s) => s.id === id);
  const open = openConcert ? blocks.get(openConcert.id) : null;

  const clashCount =
    new Set(
      [...blocks.values()].filter((b) => b.clashing.length > 0).map((b) => b.concert.id)
    ).size / 1;

  return (
    <div className="rise-in">
      {filter.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-cond text-sm uppercase tracking-wider">
          {clashCount > 0 ? (
            <span className="text-clash">
              ⚠ {clashCount} tagged set{clashCount > 1 ? "s" : ""} in conflict on{" "}
              {DAY_LABELS[day].title}
            </span>
          ) : (
            <span className="text-[var(--stage-green)]">
              No clashes among your tagged sets on {DAY_LABELS[day].title}
            </span>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
          >
            {expanded ? "− collapse to my calendar" : "+ expand full schedule"}
          </button>
        </div>
      )}

      {/* Desktop: poster-style stage grid */}
      <div className="hidden md:block">
        <StageGrid
          stages={stages}
          blocks={blocks}
          hideIneligible={hideIneligible}
          nowMinutes={nowMinutes}
          now={now}
          onOpen={setOpenConcert}
        />
      </div>

      {/* Mobile: agenda list */}
      <div className="md:hidden">
        <AgendaList
          blocks={blocks}
          stageOf={stageOf}
          hideIneligible={hideIneligible}
          nowMinutes={nowMinutes}
          now={now}
          onOpen={setOpenConcert}
        />
      </div>

      {openConcert && open && (
        <TagPopover
          concert={openConcert}
          stageName={stageOf(openConcert.stageId)?.name ?? ""}
          stageColor={stageOf(openConcert.stageId)?.color ?? "#555"}
          clashingWith={open.clashing}
          onClose={() => setOpenConcert(null)}
        />
      )}
    </div>
  );
}

function StageGrid({
  stages,
  blocks,
  hideIneligible,
  nowMinutes,
  now,
  onOpen,
}: {
  stages: Stage[];
  blocks: Map<string, BlockMeta>;
  hideIneligible: boolean;
  nowMinutes: number | null;
  now: Date | null;
  onOpen: (c: Concert) => void;
}) {
  const marks = hourMarks();
  const cols = stages.length;
  const nowRef = useRef<HTMLDivElement>(null);
  const nowSlot = nowMinutes !== null ? Math.round(nowMinutes / SLOT_MIN) : null;

  useEffect(() => {
    if (nowSlot === null) return;
    // Delayed so router scroll restoration on load can't override the jump.
    // Smooth scrolling never completes in hidden tabs (rAF is frozen), so
    // fall back to an instant jump there.
    const t = setTimeout(() => {
      nowRef.current?.scrollIntoView({
        behavior: document.visibilityState === "visible" ? "smooth" : "auto",
        block: "center",
      });
    }, 400);
    return () => clearTimeout(t);
    // Jump when the line appears for the shown day, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowSlot !== null]);

  return (
    <div
      className="relative grid gap-x-4"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr) 3.5rem`,
        gridTemplateRows: `auto repeat(${SLOTS_PER_DAY}, 0.5rem)`,
      }}
    >
      {stages.map((s, i) => (
        <div
          key={s.id}
          className="rough-bg mb-3 px-3 py-2 text-center font-display text-base text-white"
          style={
            { gridColumn: i + 1, gridRow: 1, "--block-bg": s.color } as React.CSSProperties
          }
        >
          {s.name}
        </div>
      ))}
      <div style={{ gridColumn: cols + 1, gridRow: 1 }} />

      {marks.map((m) => (
        <div
          key={m.slot}
          className="pointer-events-none relative"
          style={{
            gridColumn: `1 / span ${cols}`,
            gridRow: m.slot + 2,
          }}
        >
          <div className="time-rule absolute inset-x-0 top-0" />
        </div>
      ))}
      {marks.map((m) => (
        <div
          key={`l${m.slot}`}
          className="relative -top-2 text-right font-display text-sm text-ink/80"
          style={{ gridColumn: cols + 1, gridRow: m.slot + 2 }}
        >
          {m.label}
        </div>
      ))}

      {nowSlot !== null && (
        <div
          ref={nowRef}
          className="now-line"
          style={{
            gridColumn: `1 / span ${cols + 1}`,
            gridRow: Math.min(nowSlot, SLOTS_PER_DAY - 1) + 2,
          }}
        >
          <span className="now-dot" />
          <span className="absolute -top-2.5 right-0 font-display text-xs text-clash">
            NOW
          </span>
        </div>
      )}

      {[...blocks.values()].map(({ concert, eligible, clashing }) => {
        if (!eligible && hideIneligible) return null;
        const col = stages.findIndex((s) => s.id === concert.stageId);
        if (col < 0) return null;
        const start = slotOf(concert.startsAt);
        const end = Math.max(slotOf(concert.endsAt), start + 6);
        const big = end - start >= 18;
        const live = now !== null && isPlaying(concert, now);
        return (
          <button
            key={concert.id}
            onClick={() => onOpen(concert)}
            className={`concert-block rough-bg mx-[8%] px-2 text-center ${
              !eligible ? "is-dimmed" : ""
            } ${clashing.length ? "is-clashing clash-pulse" : ""} ${
              live ? "is-live" : ""
            }`}
            style={
              {
                gridColumn: col + 1,
                gridRow: `${start + 2} / ${end + 2}`,
                "--block-bg": stages[col].color,
              } as React.CSSProperties
            }
          >
            <span
              className={`font-display block leading-tight ${
                big ? "text-xl" : "text-[0.95rem]"
              }`}
            >
              {concert.band}
            </span>
            <span className="font-cond block text-xs font-semibold opacity-90">
              {live && <span className="live-dot mr-1.5 align-middle" />}
              {fmtRange(concert)}
            </span>
            <TagDots concertId={concert.id} />
          </button>
        );
      })}
    </div>
  );
}

function AgendaList({
  blocks,
  stageOf,
  hideIneligible,
  nowMinutes,
  now,
  onOpen,
}: {
  blocks: Map<string, BlockMeta>;
  stageOf: (id: string) => Stage | undefined;
  hideIneligible: boolean;
  nowMinutes: number | null;
  now: Date | null;
  onOpen: (c: Concert) => void;
}) {
  const rows = [...blocks.values()]
    .filter((b) => b.eligible || !hideIneligible)
    .sort((a, b) => a.concert.startsAt.localeCompare(b.concert.startsAt));
  // While something plays, the NOW line is drawn across the live card(s) at
  // the set's progress position; the standalone divider only appears in gaps
  // (above the first set that hasn't started yet).
  const anyLive =
    now !== null && nowMinutes !== null && rows.some((r) => isPlaying(r.concert, now));
  const nowIndex =
    now !== null && nowMinutes !== null && !anyLive
      ? rows.findIndex((r) => new Date(r.concert.startsAt) > now)
      : -1;
  const nowAt =
    nowIndex === -1 && nowMinutes !== null && !anyLive ? rows.length : nowIndex;
  const firstLiveIdx =
    anyLive && now !== null ? rows.findIndex((r) => isPlaying(r.concert, now)) : -1;
  const anchorIdx = anyLive ? firstLiveIdx : nowAt;
  const nowRef = useRef<HTMLLIElement>(null);
  const hasAnchor = anchorIdx >= 0 || nowAt === rows.length;

  useEffect(() => {
    if (!hasAnchor) return;
    // Same centering jump as the grid; no-ops while this view is display:none.
    const t = setTimeout(() => {
      nowRef.current?.scrollIntoView({
        behavior: document.visibilityState === "visible" ? "smooth" : "auto",
        block: "center",
      });
    }, 400);
    return () => clearTimeout(t);
  }, [hasAnchor]);

  return (
    <ul className="space-y-2">
      {rows.map(({ concert, eligible, clashing }, i) => {
        const stage = stageOf(concert.stageId);
        const live = now !== null && isPlaying(concert, now);
        const progress = live
          ? (now.getTime() - new Date(concert.startsAt).getTime()) /
            (new Date(concert.endsAt).getTime() - new Date(concert.startsAt).getTime())
          : 0;
        return (
          <li key={concert.id} ref={i === anchorIdx ? nowRef : undefined} className="relative">
            {i === nowAt && <NowDivider now={now} />}
            {live && (
              <span
                className="agenda-now-line"
                style={{ top: `${Math.min(96, Math.max(4, progress * 100))}%` }}
              />
            )}
            <button
              onClick={() => onOpen(concert)}
              className={`concert-block rough-bg-sm flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                !eligible ? "is-dimmed" : ""
              } ${clashing.length ? "is-clashing" : ""} ${live ? "is-live" : ""}`}
              style={
                {
                  "--block-bg": `color-mix(in srgb, ${stage?.color ?? "#555"} 80%, #000)`,
                } as React.CSSProperties
              }
            >
              <span className="font-display w-12 shrink-0 text-sm">
                {fmtTime(concert.startsAt)}
              </span>
              <span
                className="h-8 w-1 shrink-0"
                style={{ background: stage?.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="font-display block truncate text-base leading-tight">
                  {concert.band}
                </span>
                <span className="font-cond block text-xs uppercase tracking-wider opacity-80">
                  {live && <span className="live-dot mr-1.5 align-middle" />}
                  {stage?.name} · {fmtRange(concert)}
                </span>
              </span>
              <TagDots concertId={concert.id} />
              {clashing.length > 0 && <span className="text-clash">⚠</span>}
            </button>
          </li>
        );
      })}
      {nowAt === rows.length && rows.length > 0 && (
        <li ref={anchorIdx < 0 ? nowRef : undefined}>
          <NowDivider now={now} />
        </li>
      )}
    </ul>
  );
}

function NowDivider({ now }: { now: Date | null }) {
  return (
    <div className="mb-2 flex items-center gap-2" aria-label="current time">
      <span className="live-dot" />
      <span className="font-display text-xs text-clash">
        NOW{now ? ` · ${fmtTime(now.toISOString())}` : ""}
      </span>
      <span className="h-0.5 flex-1 bg-clash/70 shadow-[0_0_8px_rgba(255,59,48,0.7)]" />
    </div>
  );
}

function TagDots({ concertId }: { concertId: string }) {
  const { state } = useFestival();
  const dots: string[] = [];
  for (const a of state.assignments.values()) {
    if (a.concertId === concertId && a.active) {
      const tag = state.tags.find((t) => t.id === a.tagId);
      if (tag) dots.push(tag.color);
    }
  }
  if (dots.length === 0) return null;
  return (
    <span className="mt-0.5 flex justify-center gap-1">
      {dots.slice(0, 6).map((c, i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full ring-1 ring-black/40"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}
