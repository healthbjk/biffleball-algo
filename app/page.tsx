"use client";

import { useState, useEffect, useCallback } from "react";
import WeekSelector from "@/components/WeekSelector";
import TeamTable from "@/components/TeamTable";
import { useUsedTeams } from "@/hooks/useUsedTeams";
import { SEASON_WEEKS, getCurrentWeekIndex } from "@/lib/constants";
import {
  ScheduleGame,
  StandingsTeamRecord,
  PitcherSeasonStats,
  RecentTeamStats,
  TeamWeekAnalysis,
} from "@/lib/types";
import { rankTeamsForWeek, computeFutureAvgExpWins } from "@/lib/scoring";

export default function Home() {
  const [weekIndex, setWeekIndex] = useState(getCurrentWeekIndex);
  const { usedTeamIds, toggleTeam, clearAll, loaded } = useUsedTeams();
  const [rankings, setRankings] = useState<TeamWeekAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pitcherDataLoaded, setPitcherDataLoaded] = useState(false);
  const [recentDataLoaded, setRecentDataLoaded] = useState(false);
  const [futureDataLoaded, setFutureDataLoaded] = useState(false);

  const week = SEASON_WEEKS[weekIndex];

  const fetchData = useCallback(async () => {
    if (!week) return;
    setLoading(true);
    setError(null);
    setPitcherDataLoaded(false);
    setRecentDataLoaded(false);
    setFutureDataLoaded(false);

    try {
      // Phase 1: Fetch schedule + standings in parallel
      const [scheduleRes, standingsRes] = await Promise.all([
        fetch(`/api/mlb/schedule?startDate=${week.startDate}&endDate=${week.endDate}`),
        fetch("/api/mlb/standings"),
      ]);

      if (!scheduleRes.ok) throw new Error("Failed to fetch schedule");
      if (!standingsRes.ok) throw new Error("Failed to fetch standings");

      const schedule: ScheduleGame[] = await scheduleRes.json();
      const standingsObj = await standingsRes.json();

      // Reconstruct Map from JSON object
      const standings = new Map<number, StandingsTeamRecord>();
      for (const [key, value] of Object.entries(standingsObj)) {
        if (key !== "error") {
          standings.set(parseInt(key, 10), value as StandingsTeamRecord);
        }
      }

      // Initial render with base data (no pitcher/recent stats yet)
      const emptyPitchers = new Map<number, PitcherSeasonStats>();
      const emptyRecent = new Map<number, RecentTeamStats>();
      const initialRankings = rankTeamsForWeek(
        schedule,
        standings,
        emptyPitchers,
        emptyRecent,
        usedTeamIds
      );
      setRankings(initialRankings);
      setLoading(false);

      // Phase 2: Enrich with pitcher stats and recent form in parallel
      const pitcherIds = new Set<number>();
      for (const game of schedule) {
        if (game.teams.home.probablePitcher) {
          pitcherIds.add(game.teams.home.probablePitcher.id);
        }
        if (game.teams.away.probablePitcher) {
          pitcherIds.add(game.teams.away.probablePitcher.id);
        }
      }

      const teamIds = new Set<number>();
      for (const game of schedule) {
        teamIds.add(game.teams.home.team.id);
        teamIds.add(game.teams.away.team.id);
      }

      const [pitcherStatsMap, recentStatsMap] = await Promise.all([
        pitcherIds.size > 0
          ? fetchPitcherStatsFromAPI([...pitcherIds])
          : Promise.resolve(new Map<number, PitcherSeasonStats>()),
        teamIds.size > 0
          ? fetchRecentStatsFromAPI([...teamIds])
          : Promise.resolve(new Map<number, RecentTeamStats>()),
      ]);

      setPitcherDataLoaded(pitcherStatsMap.size > 0 || pitcherIds.size === 0);
      setRecentDataLoaded(recentStatsMap.size > 0 || teamIds.size === 0);

      // Re-rank with enriched data (no future data yet)
      const enrichedRankings = rankTeamsForWeek(
        schedule,
        standings,
        pitcherStatsMap,
        recentStatsMap,
        usedTeamIds
      );
      setRankings(enrichedRankings);

      // Phase 3: Fetch future schedule for survivor game theory
      try {
        const futureRes = await fetch(
          `/api/mlb/future-schedule?after=${week.endDate}`
        );
        if (futureRes.ok) {
          const futureWeekSchedules: ScheduleGame[][] = await futureRes.json();
          if (futureWeekSchedules.length > 0) {
            const futureAvg = computeFutureAvgExpWins(
              futureWeekSchedules,
              standings,
              recentStatsMap
            );
            setFutureDataLoaded(true);

            // Final re-rank with spike values
            const finalRankings = rankTeamsForWeek(
              schedule,
              standings,
              pitcherStatsMap,
              recentStatsMap,
              usedTeamIds,
              futureAvg
            );
            setRankings(finalRankings);
          }
        }
      } catch {
        // Future data is optional — degrade gracefully
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  }, [week, usedTeamIds]);

  useEffect(() => {
    if (loaded) {
      fetchData();
    }
  }, [fetchData, loaded]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">
          BiffleBall Pick Optimizer
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Estimate expected wins per team to find your best pick each week.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <WeekSelector selectedIndex={weekIndex} onChange={setWeekIndex} />
        <div className="flex items-center gap-3">
          <DataBadge label="FIP" loaded={pitcherDataLoaded} />
          <DataBadge label="Recent Form" loaded={recentDataLoaded} />
          <DataBadge label="Survivor" loaded={futureDataLoaded} />
          <button
            onClick={clearAll}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300"
          >
            Clear Used Teams
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button
            onClick={fetchData}
            className="ml-3 text-red-200 underline hover:text-red-100"
          >
            Retry
          </button>
        </div>
      )}

      <TeamTable
        data={rankings}
        onToggleUsed={toggleTeam}
        loading={loading}
      />

      <footer className="mt-6 text-xs text-gray-600">
        <p>
          Expected wins use Pythagorean win%, log5 matchup probability,
          home field advantage, probable pitcher quality, and recent 14-day
          form. Data from MLB Stats API.
        </p>
      </footer>
    </main>
  );
}

function DataBadge({ label, loaded }: { label: string; loaded: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        loaded
          ? "bg-green-900/40 text-green-400"
          : "bg-gray-800 text-gray-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          loaded ? "bg-green-400" : "bg-gray-600 animate-pulse"
        }`}
      />
      {label}
    </span>
  );
}

async function fetchPitcherStatsFromAPI(
  ids: number[]
): Promise<Map<number, PitcherSeasonStats>> {
  try {
    const res = await fetch(`/api/mlb/pitcher-stats?ids=${ids.join(",")}`);
    if (!res.ok) return new Map();
    const obj = await res.json();
    const map = new Map<number, PitcherSeasonStats>();
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "error") {
        map.set(parseInt(key, 10), value as PitcherSeasonStats);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchRecentStatsFromAPI(
  ids: number[]
): Promise<Map<number, RecentTeamStats>> {
  try {
    const res = await fetch(`/api/mlb/recent?ids=${ids.join(",")}`);
    if (!res.ok) return new Map();
    const obj = await res.json();
    const map = new Map<number, RecentTeamStats>();
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "error") {
        map.set(parseInt(key, 10), value as RecentTeamStats);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}
