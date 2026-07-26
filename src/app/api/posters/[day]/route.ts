import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/appwrite";
import { env } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";

type Params = { params: Promise<{ day: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { day } = await params;
    if (!/^[1-6]$/.test(day)) {
      return NextResponse.json({ error: "Day must be 1-6" }, { status: 400 });
    }
    const { storage } = adminClient();
    const bytes = await storage.getFileView({
      bucketId: env.bucketId,
      fileId: `poster-d${day}`,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
