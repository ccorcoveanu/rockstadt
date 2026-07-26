import { redirect } from "next/navigation";
import { getUser } from "@/lib/server/auth";
import { getSchedule, listTagsFor } from "@/lib/server/store";
import { AdminApp } from "@/components/admin/AdminApp";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getUser();
  if (!user?.isAdmin) redirect("/");
  const [schedule, tags] = await Promise.all([getSchedule(), listTagsFor(null)]);
  return <AdminApp schedule={schedule} globalTags={tags} adminName={user.name || user.email} />;
}
