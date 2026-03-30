import { NextResponse } from "next/server";
import { fetchStandings } from "@/lib/mlb";

export async function GET() {
  try {
    const standings = await fetchStandings();
    // Convert Map to plain object for JSON serialization
    const obj: Record<string, unknown> = {};
    standings.forEach((value, key) => {
      obj[key] = value;
    });
    return NextResponse.json(obj, {
      headers: { "Cache-Control": "public, s-maxage=300" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch standings" },
      { status: 500 }
    );
  }
}
