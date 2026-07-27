import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/server/env";
import { clientIp, jsonError, rateLimit } from "@/lib/server/http";
import { createSnapshotShare } from "@/lib/server/store";

const Body = z.object({
  calendarName: z.string().min(1).max(128),
  ownerName: z.string().min(1).max(128),
  tags: z
    .array(
      z.object({
        slug: z.string().min(1).max(64),
        name: z.string().min(1).max(64),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        global: z.boolean(),
      })
    )
    .min(1)
    .max(50),
  assignments: z
    .array(z.object({ concertId: z.string().min(1).max(64), tagSlug: z.string().min(1).max(64) }))
    .max(1000),
});

// Anonymous share: the device uploads a frozen snapshot; the returned secret
// (kept on that device) is the only way to revoke the link.
export async function POST(req: Request) {
  try {
    rateLimit(`share:${clientIp(req)}`, 20, 3600_000);
    const snapshot = Body.parse(await req.json());
    const token = randomBytes(12).toString("hex");
    const secret = randomBytes(18).toString("base64url");
    await createSnapshotShare(token, secret, snapshot);
    return NextResponse.json(
      { token, secret, url: `${env.appUrl}/c/${token}` },
      { status: 201 }
    );
  } catch (e) {
    return jsonError(e);
  }
}
