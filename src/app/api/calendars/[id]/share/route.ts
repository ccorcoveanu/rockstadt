import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { getCalendar, updateCalendar } from "@/lib/server/store";

const Body = z.object({ enabled: z.boolean() });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cal = await getCalendar(id);
    if (!cal) return NextResponse.json({ error: "Calendar not found" }, { status: 404 });
    if (cal.ownerId !== user.id) {
      return NextResponse.json({ error: "Not your calendar" }, { status: 403 });
    }
    const { enabled } = Body.parse(await req.json());
    const token = cal.shareToken ?? randomBytes(18).toString("base64url");
    const calendar = await updateCalendar(id, { shareToken: token, shareEnabled: enabled });
    return NextResponse.json({
      calendar,
      url: enabled ? `${env.appUrl}/c/${token}` : null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
