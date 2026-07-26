import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { createCalendar, listCalendars } from "@/lib/server/store";

export async function GET() {
  try {
    const user = await requireUser();
    const calendars = await listCalendars(user.id);
    return NextResponse.json({ calendars });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  name: z.string().min(1).max(128),
  tagIds: z.array(z.string().min(1).max(64)).min(1).max(50),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { name, tagIds } = Body.parse(await req.json());
    const calendar = await createCalendar({ ownerId: user.id, name, tagIds });
    return NextResponse.json({ calendar }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
