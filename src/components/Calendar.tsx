"use client";

import { useMemo, useState } from "react";
import type { Concert, Stage } from "@/lib/types";
import {
  DAY_LABELS,
  findClashes,
  fmtRange,
  fmtTime,
  hourMarks,
  slotOf,
  SLOTS_PER_DAY,
} from "@/lib/time";
import { useFestival } from "./Provider";
import { TagPopover } from "./TagPopover";

type BlockMeta = {
  concert: Concert;
  eligible: boolean;
  clashing: Concert[];
};

export function Calendar({
  day,
  filter,
}: {
  day: number;
  filter: Set<string>;
}) {
  const { state } = useFestival();
  const [openConcert, setOpenConcert] = useState<Concert | null>(null);

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
        <p className="mb-3 font-cond text-sm uppercase tracking-wider">
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
        </p>
      )}

      {/* Desktop: poster-style stage grid */}
      <div className="hidden md:block">
        <StageGrid
          stages={stages}
          blocks={blocks}
          onOpen={setOpenConcert}
        />
      </div>

      {/* Mobile: agenda list */}
      <div className="md:hidden">
        <AgendaList
          blocks={blocks}
          stageOf={stageOf}
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
  onOpen,
}: {
  stages: Stage[];
  blocks: Map<string, BlockMeta>;
  onOpen: (c: Concert) => void;
}) {
  const marks = hourMarks();
  const cols = stages.length;

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

      {[...blocks.values()].map(({ concert, eligible, clashing }) => {
        const col = stages.findIndex((s) => s.id === concert.stageId);
        if (col < 0) return null;
        const start = slotOf(concert.startsAt);
        const end = Math.max(slotOf(concert.endsAt), start + 6);
        const big = end - start >= 18;
        return (
          <button
            key={concert.id}
            onClick={() => onOpen(concert)}
            className={`concert-block rough-bg mx-[8%] px-2 text-center ${
              !eligible ? "is-dimmed" : ""
            } ${clashing.length ? "is-clashing clash-pulse" : ""}`}
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
  onOpen,
}: {
  blocks: Map<string, BlockMeta>;
  stageOf: (id: string) => Stage | undefined;
  onOpen: (c: Concert) => void;
}) {
  const rows = [...blocks.values()].sort((a, b) =>
    a.concert.startsAt.localeCompare(b.concert.startsAt)
  );
  return (
    <ul className="space-y-2">
      {rows.map(({ concert, eligible, clashing }) => {
        const stage = stageOf(concert.stageId);
        return (
          <li key={concert.id}>
            <button
              onClick={() => onOpen(concert)}
              className={`concert-block rough-bg-sm flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                !eligible ? "is-dimmed" : ""
              } ${clashing.length ? "is-clashing" : ""}`}
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
                  {stage?.name} · {fmtRange(concert)}
                </span>
              </span>
              <TagDots concertId={concert.id} />
              {clashing.length > 0 && <span className="text-clash">⚠</span>}
            </button>
          </li>
        );
      })}
    </ul>
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
