import type { Concert } from "./types";

// The whole festival runs in EEST (UTC+3); rendering is pinned to festival-local
// time so the calendar looks the same from any visitor timezone.
const FEST_UTC_OFFSET_MIN = 180;

// The visual day spans 14:00 → 03:30 festival time.
export const DAY_START_MIN = 14 * 60;
export const DAY_END_MIN = 27 * 60 + 30;
export const SLOT_MIN = 5;
export const SLOTS_PER_DAY = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;

export function festivalMinutes(iso: string): number {
  const d = new Date(iso);
  return (
    d.getUTCHours() * 60 + d.getUTCMinutes() + FEST_UTC_OFFSET_MIN
  ) % (24 * 60);
}

// Minutes since the visual day start (14:00); early-morning sets wrap past midnight.
export function minutesIntoDay(iso: string): number {
  const m = festivalMinutes(iso);
  return m >= DAY_START_MIN ? m - DAY_START_MIN : m + 24 * 60 - DAY_START_MIN;
}

export function slotOf(iso: string): number {
  return Math.round(minutesIntoDay(iso) / SLOT_MIN);
}

export function fmtTime(iso: string): string {
  const m = festivalMinutes(iso);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function fmtRange(c: Pick<Concert, "startsAt" | "endsAt" | "openEnded">): string {
  return c.openEnded
    ? `${fmtTime(c.startsAt)} ~ …`
    : `${fmtTime(c.startsAt)} ~ ${fmtTime(c.endsAt)}`;
}

export function overlaps(a: Concert, b: Concert): boolean {
  if (a.day !== b.day || a.id === b.id) return false;
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

// Pairwise clashes within one day's concert list.
export function findClashes(concerts: Concert[]): Map<string, Concert[]> {
  const clashes = new Map<string, Concert[]>();
  for (let i = 0; i < concerts.length; i++) {
    for (let j = i + 1; j < concerts.length; j++) {
      if (overlaps(concerts[i], concerts[j])) {
        for (const [x, y] of [
          [concerts[i], concerts[j]],
          [concerts[j], concerts[i]],
        ]) {
          const list = clashes.get(x.id) ?? [];
          list.push(y);
          clashes.set(x.id, list);
        }
      }
    }
  }
  return clashes;
}

export const DAY_DATES: Record<number, string> = {
  1: "2026-07-27",
  2: "2026-07-28",
  3: "2026-07-29",
  4: "2026-07-30",
  5: "2026-07-31",
  6: "2026-08-01",
};

// Minutes into a festival day's visual window (14:00 → 03:30 local) for a
// given instant, or null when the instant falls outside that day.
export function nowIntoDay(dayDate: string, now: Date): number | null {
  const start = new Date(`${dayDate}T14:00:00+03:00`).getTime();
  const m = (now.getTime() - start) / 60_000;
  return m >= 0 && m <= DAY_END_MIN - DAY_START_MIN ? m : null;
}

export function isPlaying(c: Concert, now: Date): boolean {
  return new Date(c.startsAt) <= now && now < new Date(c.endsAt);
}

export const DAY_LABELS: Record<number, { title: string; date: string }> = {
  1: { title: "Day 1", date: "27 July" },
  2: { title: "Day 2", date: "28 July" },
  3: { title: "Day 3", date: "29 July" },
  4: { title: "Day 4", date: "30 July" },
  5: { title: "Day 5", date: "31 July" },
  6: { title: "Tribute Day", date: "1 August" },
};

export function hourMarks(): { slot: number; label: string }[] {
  const marks: { slot: number; label: string }[] = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN - 30; m += 60) {
    const h = Math.floor(m / 60) % 24;
    marks.push({
      slot: (m - DAY_START_MIN) / SLOT_MIN,
      label: `${String(h).padStart(2, "0")}:00`,
    });
  }
  return marks;
}
