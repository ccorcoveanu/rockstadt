"use client";

import { useEffect, useState } from "react";
import { DAY_DATES, DAY_LABELS } from "@/lib/time";
import type { CalendarSnapshot } from "@/lib/types";
import { FestivalProvider, useFestival, type InitialData } from "./Provider";
import { Calendar } from "./Calendar";
import { CalendarBar } from "./CalendarBar";
import { Header } from "./Header";
import { ImportDialog } from "./ImportDialog";
import { TagBar } from "./TagBar";

const FILTER_KEY = "ref-filter";

function defaultDay(): number {
  const today = new Date().toISOString().slice(0, 10);
  for (const [d, date] of Object.entries(DAY_DATES)) {
    if (date === today) return Number(d);
  }
  return 1;
}

export function ScheduleApp({
  initial,
  importSnapshot,
}: {
  initial: InitialData;
  importSnapshot?: CalendarSnapshot;
}) {
  return (
    <FestivalProvider initial={initial}>
      <Header />
      <Hero />
      <Planner />
      <Footer />
      {importSnapshot && <ImportDialog snapshot={importSnapshot} />}
    </FestivalProvider>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 text-center">
        <p className="font-cond text-sm font-semibold uppercase tracking-[0.4em] text-muted">
          12th edition · Ghimbav / Brașov · Romania
        </p>
        <h1 className="font-display headline-shadow mt-3 text-6xl leading-[0.95] sm:text-8xl">
          Rock<span className="text-[var(--stage-magenta)]">stadt</span>
          <br />
          <span className="text-4xl sm:text-6xl">Extreme Fest</span>
        </h1>
        <p className="font-display mt-4 text-xl text-gold sm:text-2xl">
          27 – 31 July 2026 <span className="text-muted">+</span> Tribute Day 1 Aug
        </p>
        <p className="mx-auto mt-4 max-w-xl font-cond text-base text-muted">
          Unofficial schedule planner. Tag the sets you care about, filter the
          calendar, and see every clash before it hurts. Works fully offline —
          add it to your home screen and plan from the pit.
        </p>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{
          background:
            "linear-gradient(to top, var(--bg), transparent), radial-gradient(140% 130% at 50% 130%, #191130 55%, transparent 78%)",
        }}
      />
    </section>
  );
}

function Planner() {
  const { state } = useFestival();
  const [day, setDay] = useState(() => defaultDay());
  const [filter, setFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    // localStorage is client-only, so the persisted filter must land after
    // hydration; this one-shot setState is the standard pattern for that.
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setFilter(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt/absent persisted filter is not worth surfacing.
    }
  }, []);

  function changeFilter(next: Set<string>) {
    setFilter(next);
    localStorage.setItem(FILTER_KEY, JSON.stringify([...next]));
  }

  const knownTagIds = new Set(state.tags.map((t) => t.id));
  const effectiveFilter = new Set([...filter].filter((id) => knownTagIds.has(id)));

  return (
    <main id="schedule" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20">
      <TagBar filter={effectiveFilter} onFilterChange={changeFilter} />
      <CalendarBar filter={effectiveFilter} onApply={changeFilter} />

      <nav className="mt-6 flex flex-wrap gap-2">
        {Object.entries(DAY_LABELS).map(([d, meta]) => {
          const n = Number(d);
          const on = n === day;
          return (
            <button
              key={d}
              onClick={() => setDay(n)}
              className={`rough-bg px-4 py-2 font-display text-sm transition-colors sm:text-base ${
                on
                  ? "[--block-bg:var(--ink)] text-bg"
                  : "[--block-bg:var(--bg-raised)] text-ink/80 hover:text-ink"
              }`}
            >
              {meta.title}
              <span
                className={`ml-2 font-cond text-xs font-semibold ${on ? "opacity-70" : "text-muted"}`}
              >
                {meta.date}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6">
        <Calendar day={day} filter={effectiveFilter} />
      </div>
    </main>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center font-cond text-sm text-muted">
        <p>
          Fan-made planner. Times from the official timetable —{" "}
          <a
            href="https://rockstadtextremefest.ro/the-timetable-is-here/"
            className="underline decoration-dotted underline-offset-4 hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            rockstadtextremefest.ro
          </a>
          . Official posters:{" "}
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <a
              key={d}
              href={`/api/posters/${d}`}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-4 hover:text-ink"
            >
              {d === 6 ? "tribute" : `day ${d}`}
              {d < 6 ? ", " : ""}
            </a>
          ))}
          .
        </p>
        <p className="mt-2">Stay hydrated. See you in the pit. 🤘</p>
      </div>
    </footer>
  );
}
