"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import WeekSelector from "@/components/WeekSelector";
import TeamTable from "@/components/TeamTable";
import WeightsPanel from "@/components/WeightsPanel";
import { useUsedTeams } from "@/hooks/useUsedTeams";
import { useWeights } from "@/hooks/useWeights";
import { useMarketOdds } from "@/hooks/useMarketOdds";
import { SEASON_WEEKS, getCurrentWeekIndex } from "@/lib/constants";
import {
  ScheduleGame,
  StandingsTeamRecord,
  PitcherSeasonStats,
  RecentTeamStats,
  TeamWeekAnalysis,
  GameOdds,
} from "@/lib/types";
import { rankTeamsForWeek, computeFutureAvgExpWins } from "@/lib/scoring";

export default function Home() {
  const [weekIndex, setWeekIndex] = useState(getCurrentWeekIndex);
  const { usedTeamIds, toggleTeam, clearAll, loaded } = useUsedTeams();
  const { weights, updateWeight, resetToDefaults } = useWeights();
  const {
    enabled: marketEnabled,
    toggle: toggleMarket,
    loaded: marketLoaded,
  } = useMarketOdds();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pitcherDataLoaded, setPitcherDataLoaded] = useState(false);
  const [recentDataLoaded, setRecentDataLoaded] = useState(false);
  const [futureDataLoaded, setFutureDataLoaded] = useState(false);
  const [marketDataLoaded, setMarketDataLoaded] = useState(false);
  const [marketMissingKey, setMarketMissingKey] = useState(false);
  const [oddsMap, setOddsMap] = useState<Map<number, GameOdds>>(new Map());

  // Raw data state — fetched once per week change
  const [schedule, setSchedule] = useState<ScheduleGame[]>([]);
  const [standings, setStandings] = useState<Map<number, StandingsTeamRecord>>(
    new Map()
  );
  const [pitcherStatsMap, setPitcherStatsMap] = useState<
    Map<number, PitcherSeasonStats>
  >(new Map());
  const [recentStatsMap, setRecentStatsMap] = useState<
    Map<number, RecentTeamStats>
  >(new Map());
  const [futureWeekSchedules, setFutureWeekSchedules] = useState<
    ScheduleGame[][] | null
  >(null);

  const week = SEASON_WEEKS[weekIndex];

  // Recompute rankings reactively when data or weights change
  const rankings = useMemo<TeamWeekAnalysis[]>(() => {
    if (schedule.length === 0 && loading) return [];

    let futureAvg: Map<number, number> | undefined;
    if (futureWeekSchedules && futureWeekSchedules.length > 0) {
      futureAvg = computeFutureAvgExpWins(
        futureWeekSchedules,
        standings,
        recentStatsMap,
        weights
      );
    }

    return rankTeamsForWeek(
      schedule,
      standings,
      pitcherStatsMap,
      recentStatsMap,
      usedTeamIds,
      futureAvg,
      weights,
      marketEnabled ? oddsMap : undefined
    );
  }, [
    schedule,
    standings,
    pitcherStatsMap,
    recentStatsMap,
    usedTeamIds,
    futureWeekSchedules,
    weights,
    marketEnabled,
    oddsMap,
    loading,
  ]);

  const fetchData = useCallback(async () => {
    if (!week) return;
    setLoading(true);
    setError(null);
    setPitcherDataLoaded(false);
    setRecentDataLoaded(false);
    setFutureDataLoaded(false);
    setFutureWeekSchedules(null);

    try {
      // Phase 1: Fetch schedule + standings in parallel
      const [scheduleRes, standingsRes] = await Promise.all([
        fetch(
          `/api/mlb/schedule?startDate=${week.startDate}&endDate=${week.endDate}`
        ),
        fetch("/api/mlb/standings"),
      ]);

      if (!scheduleRes.ok) throw new Error("Failed to fetch schedule");
      if (!standingsRes.ok) throw new Error("Failed to fetch standings");

      const scheduleData: ScheduleGame[] = await scheduleRes.json();
      const standingsObj = await standingsRes.json();

      const standingsData = new Map<number, StandingsTeamRecord>();
      for (const [key, value] of Object.entries(standingsObj)) {
        if (key !== "error") {
          standingsData.set(parseInt(key, 10), value as StandingsTeamRecord);
        }
      }

      setSchedule(scheduleData);
      setStandings(standingsData);
      setPitcherStatsMap(new Map());
      setRecentStatsMap(new Map());
      setLoading(false);

      // Phase 2: Enrich with pitcher stats and recent form in parallel
      const pitcherIds = new Set<number>();
      for (const game of scheduleData) {
        if (game.teams.home.probablePitcher) {
          pitcherIds.add(game.teams.home.probablePitcher.id);
        }
        if (game.teams.away.probablePitcher) {
          pitcherIds.add(game.teams.away.probablePitcher.id);
        }
      }

      const teamIds = new Set<number>();
      for (const game of scheduleData) {
        teamIds.add(game.teams.home.team.id);
        teamIds.add(game.teams.away.team.id);
      }

      const [pitcherData, recentData] = await Promise.all([
        pitcherIds.size > 0
          ? fetchPitcherStatsFromAPI([...pitcherIds])
          : Promise.resolve(new Map<number, PitcherSeasonStats>()),
        teamIds.size > 0
          ? fetchRecentStatsFromAPI([...teamIds])
          : Promise.resolve(new Map<number, RecentTeamStats>()),
      ]);

      setPitcherDataLoaded(pitcherData.size > 0 || pitcherIds.size === 0);
      setRecentDataLoaded(recentData.size > 0 || teamIds.size === 0);
      setPitcherStatsMap(pitcherData);
      setRecentStatsMap(recentData);

      // Phase 3: Fetch future schedule for survivor game theory
      try {
        const futureRes = await fetch(
          `/api/mlb/future-schedule?after=${week.endDate}`
        );
        if (futureRes.ok) {
          const futureData: ScheduleGame[][] = await futureRes.json();
          if (futureData.length > 0) {
            setFutureWeekSchedules(futureData);
            setFutureDataLoaded(true);
          }
        }
      } catch {
        // Future data is optional — degrade gracefully
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    if (loaded) {
      fetchData();
    }
  }, [fetchData, loaded]);

  // Betting-market odds: fetched only when the user has the toggle on. Degrades
  // to the pure model when off, when no API key is configured, or when books
  // haven't posted lines for the week's games yet.
  useEffect(() => {
    if (!marketLoaded || !week) return;
    if (!marketEnabled) {
      setOddsMap(new Map());
      setMarketDataLoaded(false);
      setMarketMissingKey(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setMarketDataLoaded(false);
      try {
        const res = await fetch(
          `/api/odds?startDate=${week.startDate}&endDate=${week.endDate}`
        );
        if (!res.ok) throw new Error("odds fetch failed");
        const obj = await res.json();
        if (cancelled) return;
        if (obj.disabled) {
          setMarketMissingKey(true);
          setOddsMap(new Map());
          setMarketDataLoaded(false);
          return;
        }
        setMarketMissingKey(false);
        const map = new Map<number, GameOdds>();
        for (const [key, value] of Object.entries(obj)) {
          if (key !== "error") map.set(parseInt(key, 10), value as GameOdds);
        }
        setOddsMap(map);
        setMarketDataLoaded(map.size > 0);
      } catch {
        if (!cancelled) {
          setOddsMap(new Map());
          setMarketDataLoaded(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [week, marketEnabled, marketLoaded]);

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
          {marketEnabled && <DataBadge label="Market" loaded={marketDataLoaded} />}
          <button
            onClick={toggleMarket}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              marketEnabled
                ? "border-blue-600 bg-blue-900/30 text-blue-300 hover:border-blue-500"
                : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
            }`}
            title="Blend de-vigged betting-market win probabilities into the model where lines exist"
          >
            Betting Odds: {marketEnabled ? "On" : "Off"}
          </button>
          <button
            onClick={clearAll}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300"
          >
            Clear Used Teams
          </button>
        </div>
      </div>

      <div className="mb-4">
        <WeightsPanel
          weights={weights}
          onUpdateWeight={updateWeight}
          onReset={resetToDefaults}
        />
      </div>

      {marketEnabled && marketMissingKey && (
        <div className="mb-4 rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
          Betting Odds is on, but no <code className="font-mono">ODDS_API_KEY</code>{" "}
          is configured on the server, so the model is running unchanged. Add a
          key from the-odds-api.com to enable market blending.
        </div>
      )}

      {marketEnabled && !marketMissingKey && marketDataLoaded && (
        <div className="mb-4 rounded-lg border border-blue-900 bg-blue-900/20 px-4 py-3 text-sm text-blue-300">
          Market blending active for {oddsMap.size} game
          {oddsMap.size === 1 ? "" : "s"} with posted lines. Books price MLB
          games ~1 day out, so later-week games still use the model until their
          lines open.
        </div>
      )}

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

      <TeamTable data={rankings} onToggleUsed={toggleTeam} loading={loading} />

      <footer className="mt-6 text-xs text-gray-600">
        <p>
          Expected wins use Pythagorean win%, log5 matchup probability, home
          field advantage, probable pitcher quality, and recent 14-day form.
          Data from MLB Stats API. With Betting Odds on, de-vigged moneylines
          (the-odds-api.com) are blended in for games that have posted lines.
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
