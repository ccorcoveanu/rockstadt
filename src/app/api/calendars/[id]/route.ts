import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { deleteCalendar, getCalendar, updateCalendar } from "@/lib/server/store";

const Body = z.object({
  name: z.string().min(1).max(128).optional(),
  tagIds: z.array(z.string().min(1).max(64)).min(1).max(50).optional(),
});

type Params = { params: Promise<{ id: string }> };

async function ownedCalendar(id: string, userId: string) {
  const cal = await getCalendar(id);
  if (!cal) return { error: NextResponse.json({ error: "Calendar not found" }, { status: 404 }) };
  if (cal.ownerId !== userId) {
    return { error: NextResponse.json({ error: "Not your calendar" }, { status: 403 }) };
  }
  return { cal };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { error } = await ownedCalendar(id, user.id);
    if (error) return error;
    const data = Body.parse(await req.json());
    const calendar = await updateCalendar(id, data);
    return NextResponse.json({ calendar });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { error } = await ownedCalendar(id, user.id);
    if (error) return error;
    await deleteCalendar(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
