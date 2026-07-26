import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { getSchedule } from "@/lib/server/store";

export async function GET() {
  try {
    const schedule = await getSchedule();
    return NextResponse.json(schedule, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
