import Link from "next/link";
import { ScheduleApp } from "@/components/ScheduleApp";
import { adminClient } from "@/lib/server/appwrite";
import { getUser } from "@/lib/server/auth";
import {
  buildSnapshot,
  findCalendarByToken,
  findSnapshotShare,
  getSchedule,
  listAssignments,
  listCalendars,
  listTagsFor,
} from "@/lib/server/store";
import type { CalendarSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SharedCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const validToken = /^[A-Za-z0-9_-]{10,64}$/.test(token);
  const cal = validToken ? await findCalendarByToken(token) : null;
  let frozen: CalendarSnapshot | null = null;
  if (!cal && validToken) frozen = await findSnapshotShare(token);

  if (!cal && !frozen) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-4xl">Link dead 💀</h1>
        <p className="mt-3 font-cond text-muted">
          This shared calendar does not exist or its owner turned the link off.
        </p>
        <Link
          href="/"
          className="rough-bg-sm [--block-bg:var(--stage-magenta)] mt-6 px-4 py-2 font-cond font-bold uppercase text-white"
        >
          Open the planner
        </Link>
      </main>
    );
  }

  let snapshot: CalendarSnapshot;
  if (cal) {
    const { users } = adminClient();
    const owner = await users.get({ userId: cal.ownerId }).catch(() => null);
    snapshot = await buildSnapshot(cal, owner?.name || "a fellow metalhead");
  } else {
    snapshot = frozen!;
  }
  const [schedule, user] = await Promise.all([getSchedule(), getUser()]);
  const [tags, assignments, calendars] = await Promise.all([
    listTagsFor(user?.id ?? null),
    user ? listAssignments(user.id) : Promise.resolve([]),
    user ? listCalendars(user.id) : Promise.resolve([]),
  ]);

  return (
    <ScheduleApp
      initial={{ schedule, user, tags, assignments, calendars }}
      importSnapshot={snapshot}
    />
  );
}
