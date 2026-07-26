import { NextResponse } from "next/server";
import { OAuthProvider } from "node-appwrite";
import { adminClient } from "@/lib/server/appwrite";
import { env } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";

export async function GET() {
  try {
    const { account } = adminClient();
    const url = await account.createOAuth2Token({
      provider: OAuthProvider.Google,
      success: `${env.appUrl}/api/auth/oauth/callback`,
      failure: `${env.appUrl}/?authError=google`,
    });
    return NextResponse.redirect(url);
  } catch (e) {
    return jsonError(e);
  }
}
