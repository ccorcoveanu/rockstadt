import { NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { z } from "zod";
import { adminClient } from "@/lib/server/appwrite";
import { setSessionCookie } from "@/lib/server/auth";
import { clientIp, jsonError, rateLimit } from "@/lib/server/http";

const Body = z.object({
  name: z.string().min(1).max(128),
  email: z.email(),
  password: z.string().min(8).max(256),
});

export async function POST(req: Request) {
  try {
    rateLimit(`register:${clientIp(req)}`, 5);
    const { name, email, password } = Body.parse(await req.json());
    const { account } = adminClient();
    await account.create({ userId: ID.unique(), email, password, name });
    const session = await account.createEmailPasswordSession({ email, password });
    await setSessionCookie(session.secret, session.expire);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
