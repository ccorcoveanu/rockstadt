"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { engine, type EngineState } from "@/lib/client/engine";
import { asgKey } from "@/lib/client/db";
import type {
  SavedCalendar,
  Schedule,
  SessionUser,
  Tag,
  TagAssignment,
} from "@/lib/types";

export type InitialData = {
  schedule: Schedule;
  user: SessionUser | null;
  tags: Tag[];
  assignments: TagAssignment[];
  calendars: SavedCalendar[];
};

const Ctx = createContext<{ state: EngineState; engine: typeof engine } | null>(null);

function snapshotFromInitial(initial: InitialData): EngineState {
  return {
    schedule: initial.schedule,
    user: initial.user,
    tags: initial.tags,
    assignments: new Map(
      initial.assignments.map((a) => [
        asgKey(a.concertId, a.tagId),
        { key: asgKey(a.concertId, a.tagId), ...a, dirty: 0 },
      ])
    ),
    calendars: initial.calendars,
    online: true,
    syncing: false,
    pendingCount: 0,
  };
}

export function FestivalProvider({
  initial,
  children,
}: {
  initial: InitialData;
  children: ReactNode;
}) {
  const [serverSnapshot] = useState(() => {
    const snap = snapshotFromInitial(initial);
    if (typeof window !== "undefined") {
      // Seed before the first subscription so the first client render
      // matches the SSR HTML; on the server the shared engine stays untouched.
      engine.seedIfEmpty(snap);
    }
    return snap;
  });

  const state = useSyncExternalStore(engine.subscribe, engine.getState, () => serverSnapshot);

  useEffect(() => {
    void engine.boot(initial);
    // Boot exactly once per page load; `initial` is SSR data and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Ctx.Provider value={{ state, engine }}>{children}</Ctx.Provider>;
}

export function useFestival() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFestival outside FestivalProvider");
  return ctx;
}

export function useActiveTagIds(concertId: string): Set<string> {
  const { state } = useFestival();
  const ids = new Set<string>();
  for (const a of state.assignments.values()) {
    if (a.concertId === concertId && a.active) ids.add(a.tagId);
  }
  return ids;
}
