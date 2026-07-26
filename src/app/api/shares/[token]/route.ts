import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/appwrite";
import { jsonError } from "@/lib/server/http";
import { buildSnapshot, findCalendarByToken } from "@/lib/server/store";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    const cal = await findCalendarByToken(token);
    if (!cal) {
      return NextResponse.json({ error: "Share not found or disabled" }, { status: 404 });
    }
    const { users } = adminClient();
    const owner = await users.get({ userId: cal.ownerId }).catch(() => null);
    const snapshot = await buildSnapshot(cal, owner?.name || "a fellow metalhead");
    return NextResponse.json({ snapshot });
  } catch (e) {
    return jsonError(e);
  }
}
