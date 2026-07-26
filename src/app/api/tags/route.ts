import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { createTag, listTagsFor } from "@/lib/server/store";
import { slugifyTag } from "@/lib/types";

export async function GET() {
  try {
    const user = await getUser();
    const tags = await listTagsFor(user?.id ?? null);
    return NextResponse.json({ tags });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  name: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { name, color } = Body.parse(await req.json());
    const slug = slugifyTag(name);
    if (!slug) {
      return NextResponse.json({ error: "Name must contain letters or digits" }, { status: 400 });
    }
    const tag = await createTag({ name, slug, color, ownerId: user.id });
    return NextResponse.json({ tag }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
