import { ScheduleApp } from "@/components/ScheduleApp";
import { getUser } from "@/lib/server/auth";
import { getSchedule, listAssignments, listTagsFor } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [schedule, user] = await Promise.all([getSchedule(), getUser()]);
  const [tags, assignments] = await Promise.all([
    listTagsFor(user?.id ?? null),
    user ? listAssignments(user.id) : Promise.resolve([]),
  ]);

  return <ScheduleApp initial={{ schedule, user, tags, assignments }} />;
}
