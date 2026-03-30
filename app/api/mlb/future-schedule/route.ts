import { NextRequest, NextResponse } from "next/server";
import { fetchSchedule } from "@/lib/mlb";
import { SEASON_WEEKS } from "@/lib/constants";
import { ScheduleGame } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const afterDate = searchParams.get("after");

  if (!afterDate) {
    return NextResponse.json(
      { error: "after parameter is required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    // Find all future weeks after the given date
    const futureWeeks = SEASON_WEEKS.filter((w) => w.startDate > afterDate);

    // Fetch schedules for future weeks in batches to avoid too many requests.
    // Group into ~4-week chunks to reduce API calls.
    const chunkSize = 28; // 4 weeks of days
    const weeklySchedules: ScheduleGame[][] = [];

    for (let i = 0; i < futureWeeks.length; i += 4) {
      const chunk = futureWeeks.slice(i, i + 4);
      const startDate = chunk[0].startDate;
      const endDate = chunk[chunk.length - 1].endDate;

      const games = await fetchSchedule(startDate, endDate);

      // Split into per-week buckets
      for (const week of chunk) {
        const weekGames = games.filter(
          (g) => g.officialDate >= week.startDate && g.officialDate <= week.endDate
        );
        weeklySchedules.push(weekGames);
      }
    }

    return NextResponse.json(weeklySchedules, {
      headers: { "Cache-Control": "public, s-maxage=3600" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch future schedule" },
      { status: 500 }
    );
  }
}
