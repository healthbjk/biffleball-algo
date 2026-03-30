import { NextResponse } from "next/server";
import { fetchTeams } from "@/lib/mlb";

export async function GET() {
  try {
    const teams = await fetchTeams();
    return NextResponse.json(teams, {
      headers: { "Cache-Control": "public, s-maxage=86400" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch teams" },
      { status: 500 }
    );
  }
}
