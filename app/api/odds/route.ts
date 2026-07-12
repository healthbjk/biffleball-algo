import { NextRequest, NextResponse } from "next/server";
import { fetchGameOdds } from "@/lib/mlb";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 }
    );
  }

  // Market blending is optional — no key configured means the feature is off.
  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({ disabled: true });
  }

  try {
    const odds = await fetchGameOdds(startDate, endDate);
    const obj: Record<string, unknown> = {};
    odds.forEach((value, key) => {
      obj[key] = value;
    });
    return NextResponse.json(obj, {
      // Lines move, so cache briefly.
      headers: { "Cache-Control": "public, s-maxage=900" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch odds" },
      { status: 500 }
    );
  }
}
