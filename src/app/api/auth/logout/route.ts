import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/server/appwrite";
import { clearSessionCookie, getSessionSecret } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function POST() {
  try {
    const secret = await getSessionSecret();
    if (secret) {
      try {
        await sessionClient(secret).account.deleteSession({ sessionId: "current" });
      } catch {
        // Session already invalid on the Appwrite side; clearing the cookie is enough.
      }
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
