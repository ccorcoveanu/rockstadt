import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/server/appwrite";
import { setSessionCookie } from "@/lib/server/auth";
import { clientIp, jsonError, rateLimit } from "@/lib/server/http";

const Body = z.object({
  email: z.email(),
  password: z.string().min(1).max(256),
});

export async function POST(req: Request) {
  try {
    rateLimit(`login:${clientIp(req)}`, 10);
    const { email, password } = Body.parse(await req.json());
    const { account } = adminClient();
    const session = await account.createEmailPasswordSession({ email, password });
    await setSessionCookie(session.secret, session.expire);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
