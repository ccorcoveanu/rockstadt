import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { deleteConcert, updateConcert } from "@/lib/server/store";

const PatchBody = z.object({
  band: z.string().min(1).max(256).optional(),
  stageId: z.string().min(1).max(64).optional(),
  day: z.number().int().min(1).max(6).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  openEnded: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const data = PatchBody.parse(await req.json());
    const concert = await updateConcert(id, data);
    return NextResponse.json({ concert });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    await deleteConcert(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
