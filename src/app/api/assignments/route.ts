import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { listAssignments, upsertAssignments } from "@/lib/server/store";

export async function GET() {
  try {
    const user = await requireUser();
    const assignments = await listAssignments(user.id);
    return NextResponse.json({ assignments });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  assignments: z
    .array(
      z.object({
        concertId: z.string().min(1).max(64),
        tagId: z.string().min(1).max(64),
        active: z.boolean(),
        clientUpdatedAt: z.iso.datetime(),
      })
    )
    .max(1000),
});

// Sync endpoint: client pushes local mutations (including tombstones),
// server resolves last-write-wins and returns the surviving rows.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { assignments } = Body.parse(await req.json());
    const resolved = await upsertAssignments(user.id, assignments);
    return NextResponse.json({ assignments: resolved });
  } catch (e) {
    return jsonError(e);
  }
}
