import { MLB_API_BASE } from "./constants";
import {
  MLBTeam,
  ScheduleGame,
  StandingsTeamRecord,
  PitcherSeasonStats,
  RecentTeamStats,
} from "./types";

export async function fetchTeams(): Promise<MLBTeam[]> {
  const res = await fetch(`${MLB_API_BASE}/teams?sportId=1`);
  if (!res.ok) throw new Error(`Failed to fetch teams: ${res.status}`);
  const data = await res.json();
  return data.teams
    .filter((t: { active: boolean }) => t.active)
    .map((t: { id: number; name: string; abbreviation: string; link: string }) => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      link: t.link,
    }));
}

export async function fetchSchedule(
  startDate: string,
  endDate: string
): Promise<ScheduleGame[]> {
  const res = await fetch(
    `${MLB_API_BASE}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=probablePitcher`
  );
  if (!res.ok) throw new Error(`Failed to fetch schedule: ${res.status}`);
  const data = await res.json();

  const games: ScheduleGame[] = [];
  for (const dateEntry of data.dates || []) {
    for (const game of dateEntry.games || []) {
      if (game.gameType === "R") {
        games.push({
          gamePk: game.gamePk,
          officialDate: game.officialDate,
          dayNight: game.dayNight,
          gameType: game.gameType,
          status: {
            abstractGameState: game.status?.abstractGameState,
            detailedState: game.status?.detailedState,
          },
          teams: {
            away: {
              team: {
                id: game.teams.away.team.id,
                name: game.teams.away.team.name,
                abbreviation: game.teams.away.team.abbreviation || "",
                link: game.teams.away.team.link,
              },
              leagueRecord: game.teams.away.leagueRecord,
              probablePitcher: game.teams.away.probablePitcher
                ? {
                    id: game.teams.away.probablePitcher.id,
                    fullName: game.teams.away.probablePitcher.fullName,
                    link: game.teams.away.probablePitcher.link,
                  }
                : undefined,
              score: game.teams.away.score,
              isWinner: game.teams.away.isWinner,
            },
            home: {
              team: {
                id: game.teams.home.team.id,
                name: game.teams.home.team.name,
                abbreviation: game.teams.home.team.abbreviation || "",
                link: game.teams.home.team.link,
              },
              leagueRecord: game.teams.home.leagueRecord,
              probablePitcher: game.teams.home.probablePitcher
                ? {
                    id: game.teams.home.probablePitcher.id,
                    fullName: game.teams.home.probablePitcher.fullName,
                    link: game.teams.home.probablePitcher.link,
                  }
                : undefined,
              score: game.teams.home.score,
              isWinner: game.teams.home.isWinner,
            },
          },
          venue: {
            id: game.venue?.id,
            name: game.venue?.name,
          },
        });
      }
    }
  }
  return games;
}

export async function fetchStandings(): Promise<Map<number, StandingsTeamRecord>> {
  const res = await fetch(`${MLB_API_BASE}/standings?leagueId=103,104`);
  if (!res.ok) throw new Error(`Failed to fetch standings: ${res.status}`);
  const data = await res.json();

  const map = new Map<number, StandingsTeamRecord>();
  for (const record of data.records || []) {
    for (const tr of record.teamRecords || []) {
      map.set(tr.team.id, {
        team: {
          id: tr.team.id,
          name: tr.team.name,
          abbreviation: tr.team.abbreviation || "",
          link: tr.team.link,
        },
        wins: tr.wins,
        losses: tr.losses,
        winningPercentage: tr.winningPercentage,
        runDifferential: tr.runDifferential,
        runsScored: tr.runsScored,
        runsAllowed: tr.runsAllowed,
        streak: tr.streak,
        records: {
          splitRecords: tr.records?.splitRecords || [],
        },
      });
    }
  }
  return map;
}

export async function fetchPitcherStats(
  pitcherIds: number[]
): Promise<Map<number, PitcherSeasonStats>> {
  const map = new Map<number, PitcherSeasonStats>();
  if (pitcherIds.length === 0) return map;

  const currentYear = new Date().getFullYear();

  // Fetch in parallel, batches of 10 to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < pitcherIds.length; i += batchSize) {
    const batch = pitcherIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const res = await fetch(
          `${MLB_API_BASE}/people/${id}/stats?stats=season&season=${currentYear}&group=pitching`
        );
        if (!res.ok) return null;
        const data = await res.json();
        const stats = data.stats?.[0]?.splits?.[0]?.stat;
        if (!stats) return null;
        const ip = parseFloat(stats.inningsPitched) || 0;
        const k = stats.strikeOuts || 0;
        const bb = stats.baseOnBalls || 0;
        const hr = stats.homeRuns || 0;
        // FIP = ((13×HR) + (3×BB) - (2×K)) / IP + 3.10
        const fip = ip > 0
          ? ((13 * hr) + (3 * bb) - (2 * k)) / ip + 3.10
          : 4.0;
        return {
          pitcherId: id,
          fullName: data.stats?.[0]?.splits?.[0]?.player?.fullName || `Player ${id}`,
          era: parseFloat(stats.era) || 4.0,
          fip,
          whip: parseFloat(stats.whip) || 1.3,
          inningsPitched: ip,
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          strikeOuts: k,
          baseOnBalls: bb,
          homeRuns: hr,
        } as PitcherSeasonStats;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        map.set(result.value.pitcherId, result.value);
      }
    }
  }

  return map;
}

export async function fetchRecentTeamStats(
  teamIds: number[],
  days: number = 14
): Promise<Map<number, RecentTeamStats>> {
  const map = new Map<number, RecentTeamStats>();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const start = fmt(startDate);
  const end = fmt(endDate);

  const results = await Promise.allSettled(
    teamIds.map(async (teamId) => {
      // Fetch recent game log to compute W/L and run differential
      const res = await fetch(
        `${MLB_API_BASE}/schedule?sportId=1&teamId=${teamId}&startDate=${start}&endDate=${end}&gameType=R`
      );
      if (!res.ok) return null;
      const data = await res.json();

      let wins = 0;
      let losses = 0;
      let runsScored = 0;
      let runsAllowed = 0;

      for (const dateEntry of data.dates || []) {
        for (const game of dateEntry.games || []) {
          if (game.status?.abstractGameState !== "Final") continue;
          const isHome = game.teams.home.team.id === teamId;
          const teamSide = isHome ? game.teams.home : game.teams.away;
          const oppSide = isHome ? game.teams.away : game.teams.home;

          if (teamSide.isWinner) wins++;
          else losses++;

          runsScored += teamSide.score || 0;
          runsAllowed += oppSide.score || 0;
        }
      }

      const gamesPlayed = wins + losses;
      return {
        teamId,
        gamesPlayed,
        wins,
        losses,
        runsScored,
        runsAllowed,
        recentWinPct: gamesPlayed > 0 ? wins / gamesPlayed : 0.5,
        recentRunDifferentialPerGame:
          gamesPlayed > 0 ? (runsScored - runsAllowed) / gamesPlayed : 0,
      } as RecentTeamStats;
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      map.set(result.value.teamId, result.value);
    }
  }

  return map;
}
