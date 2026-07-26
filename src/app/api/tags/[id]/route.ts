import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { deleteTag, getTag, updateTag } from "@/lib/server/store";
import { slugifyTag } from "@/lib/types";

const Body = z.object({
  name: z.string().min(1).max(64).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

async function ownedTag(id: string, userId: string) {
  const tag = await getTag(id);
  if (!tag) return { error: NextResponse.json({ error: "Tag not found" }, { status: 404 }) };
  if (tag.ownerId !== userId) {
    return { error: NextResponse.json({ error: "Not your tag" }, { status: 403 }) };
  }
  return { tag };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { error } = await ownedTag(id, user.id);
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

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { error } = await ownedTag(id, user.id);
    if (error) return error;
    await deleteTag(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
