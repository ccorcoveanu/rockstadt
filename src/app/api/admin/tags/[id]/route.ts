import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { deleteTag, getTag, updateTag } from "@/lib/server/store";
import { isGlobalTag, slugifyTag } from "@/lib/types";

const Body = z.object({
  name: z.string().min(1).max(64).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

async function globalTagOr404(id: string) {
  const tag = await getTag(id);
  if (!tag) return { error: NextResponse.json({ error: "Tag not found" }, { status: 404 }) };
  if (!isGlobalTag(tag)) {
    return {
      error: NextResponse.json({ error: "Not a global tag — user tags are managed by their owner" }, { status: 400 }),
    };
  }
  return { tag };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { error } = await globalTagOr404(id);
    if (error) return error;
    const body = Body.parse(await req.json());
    const tag = await updateTag(id, {
      ...body,
      ...(body.name ? { slug: slugifyTag(body.name) } : {}),
    });
    return NextResponse.json({ tag });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { error } = await globalTagOr404(id);
    if (error) return error;
    await deleteTag(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
