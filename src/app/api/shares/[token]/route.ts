import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/appwrite";
import { jsonError } from "@/lib/server/http";
import {
  buildSnapshot,
  deleteSnapshotShare,
  findCalendarByToken,
  findSnapshotShare,
} from "@/lib/server/store";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    const cal = await findCalendarByToken(token);
    if (cal) {
      const { users } = adminClient();
      const owner = await users.get({ userId: cal.ownerId }).catch(() => null);
      const snapshot = await buildSnapshot(cal, owner?.name || "a fellow metalhead");
      return NextResponse.json({ snapshot });
    }
    const frozen = await findSnapshotShare(token);
    if (frozen) return NextResponse.json({ snapshot: frozen });
    return NextResponse.json({ error: "Share not found or disabled" }, { status: 404 });
  } catch (e) {
    return jsonError(e);
  }
}

// Revoke an anonymous (frozen) share; the creating device holds the secret.
export async function DELETE(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    const secret = req.headers.get("x-share-secret") ?? "";
    if (!secret || !(await deleteSnapshotShare(token, secret))) {
      return NextResponse.json({ error: "Share not found or wrong secret" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
