import { NextRequest, NextResponse } from "next/server";
import { fetchPitcherStats } from "@/lib/mlb";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json(
      { error: "ids parameter is required (comma-separated pitcher IDs)" },
      { status: 400 }
    );
  }

  const ids = idsParam
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  if (ids.length === 0) {
    return NextResponse.json({});
  }

  try {
    const stats = await fetchPitcherStats(ids);
    const obj: Record<string, unknown> = {};
    stats.forEach((value, key) => {
      obj[key] = value;
    });
    return NextResponse.json(obj, {
      headers: { "Cache-Control": "public, s-maxage=3600" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pitcher stats" },
      { status: 500 }
    );
  }
}
