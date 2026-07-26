import { ScheduleApp } from "@/components/ScheduleApp";
import { getUser } from "@/lib/server/auth";
import {
  getSchedule,
  listAssignments,
  listCalendars,
  listTagsFor,
} from "@/lib/server/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [schedule, user] = await Promise.all([getSchedule(), getUser()]);
  const [tags, assignments, calendars] = await Promise.all([
    listTagsFor(user?.id ?? null),
    user ? listAssignments(user.id) : Promise.resolve([]),
    user ? listCalendars(user.id) : Promise.resolve([]),
  ]);

  return <ScheduleApp initial={{ schedule, user, tags, assignments, calendars }} />;
}
