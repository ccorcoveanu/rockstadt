import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await getUser();
    return NextResponse.json({ user });
  } catch (e) {
    return jsonError(e);
  }
}
