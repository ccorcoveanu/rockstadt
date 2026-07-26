import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { createTag } from "@/lib/server/store";
import { GLOBAL_OWNER, slugifyTag } from "@/lib/types";

const Body = z.object({
  name: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { name, color } = Body.parse(await req.json());
    const slug = slugifyTag(name);
    if (!slug) {
      return NextResponse.json({ error: "Name must contain letters or digits" }, { status: 400 });
    }
    const tag = await createTag({ name, slug, color, ownerId: GLOBAL_OWNER });
    return NextResponse.json({ tag }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
