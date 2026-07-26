import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { createConcert } from "@/lib/server/store";

const ConcertBody = z.object({
  band: z.string().min(1).max(256),
  stageId: z.string().min(1).max(64),
  day: z.number().int().min(1).max(6),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  openEnded: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const data = ConcertBody.parse(await req.json());
    const concert = await createConcert(data);
    return NextResponse.json({ concert }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
