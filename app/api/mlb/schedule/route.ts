import { NextRequest, NextResponse } from "next/server";
import { fetchSchedule } from "@/lib/mlb";

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

  try {
    const games = await fetchSchedule(startDate, endDate);
    return NextResponse.json(games, {
      headers: { "Cache-Control": "public, s-maxage=300" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch schedule" },
      { status: 500 }
    );
  }
}
