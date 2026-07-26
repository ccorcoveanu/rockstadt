import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/appwrite";
import { setSessionCookie } from "@/lib/server/auth";
import { env } from "@/lib/server/env";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const secret = searchParams.get("secret");
  if (!userId || !secret) {
    return NextResponse.redirect(`${env.appUrl}/?authError=google`);
  }
  try {
    const { account } = adminClient();
    const session = await account.createSession({ userId, secret });
    await setSessionCookie(session.secret, session.expire);
    return NextResponse.redirect(`${env.appUrl}/?login=ok`);
  } catch {
    return NextResponse.redirect(`${env.appUrl}/?authError=google`);
  }
}
