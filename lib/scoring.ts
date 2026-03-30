import {
  ScheduleGame,
  StandingsTeamRecord,
  PitcherSeasonStats,
  RecentTeamStats,
  TeamWeekAnalysis,
  GameAnalysis,
} from "./types";
import {
  HOME_FIELD_ADVANTAGE,
  PYTHAGOREAN_EXPONENT,
  RECENT_FORM_WEIGHT,
  LEAGUE_AVG_ERA,
  PITCHER_ADJUSTMENT_MAX,
  REGRESSION_GAMES,
} from "./constants";

export function pythagoreanWinPct(
  runsScored: number,
  runsAllowed: number
): number {
  if (runsScored + runsAllowed === 0) return 0.5;
  const exp = PYTHAGOREAN_EXPONENT;
  return (
    Math.pow(runsScored, exp) /
    (Math.pow(runsScored, exp) + Math.pow(runsAllowed, exp))
  );
}

export function regressToMean(
  rawPct: number,
  gamesPlayed: number
): number {
  // Blend raw estimate with .500 based on sample size.
  // More games → more trust in the observed rate.
  const weight = gamesPlayed / (gamesPlayed + REGRESSION_GAMES);
  return weight * rawPct + (1 - weight) * 0.5;
}

export function log5WinProbability(
  teamPct: number,
  opponentPct: number
): number {
  const pA = teamPct;
  const pB = opponentPct;
  const denom = pA + pB - 2 * pA * pB;
  if (denom === 0) return 0.5;
  return (pA - pA * pB) / denom;
}

export function adjustForHomeField(
  probability: number,
  isHome: boolean
): number {
  const adjusted = isHome
    ? probability + HOME_FIELD_ADVANTAGE
    : probability - HOME_FIELD_ADVANTAGE;
  return Math.max(0.01, Math.min(0.99, adjusted));
}

export function pitcherAdjustment(
  teamPitcherFIP: number | null,
  opponentPitcherFIP: number | null
): number {
  // Uses FIP (Fielder Independent Pitching) instead of ERA.
  // FIP isolates what the pitcher controls: strikeouts, walks, home runs.
  // League average FIP ≈ 4.00 (same scale as ERA).
  let adjustment = 0;

  if (teamPitcherFIP !== null) {
    // Lower FIP = better pitcher = positive adjustment
    const teamDiff = (LEAGUE_AVG_ERA - teamPitcherFIP) / LEAGUE_AVG_ERA;
    adjustment += teamDiff * PITCHER_ADJUSTMENT_MAX;
  }

  if (opponentPitcherFIP !== null) {
    // Higher opponent FIP = worse pitcher = positive adjustment for us
    const oppDiff = (opponentPitcherFIP - LEAGUE_AVG_ERA) / LEAGUE_AVG_ERA;
    adjustment += oppDiff * PITCHER_ADJUSTMENT_MAX;
  }

  // Clamp total adjustment
  return Math.max(
    -PITCHER_ADJUSTMENT_MAX * 2,
    Math.min(PITCHER_ADJUSTMENT_MAX * 2, adjustment)
  );
}

export function blendWithRecentForm(
  seasonPythag: number,
  recentPythag: number | null
): number {
  if (recentPythag === null) return seasonPythag;
  return seasonPythag * (1 - RECENT_FORM_WEIGHT) + recentPythag * RECENT_FORM_WEIGHT;
}

export function calculateGameWinProbability(
  teamPythag: number,
  opponentPythag: number,
  isHome: boolean,
  teamPitcherFIP: number | null,
  opponentPitcherFIP: number | null,
  teamRecentPythag: number | null,
  opponentRecentPythag: number | null
): number {
  // Blend season + recent form for both teams
  const teamBlended = blendWithRecentForm(teamPythag, teamRecentPythag);
  const oppBlended = blendWithRecentForm(opponentPythag, opponentRecentPythag);

  // Base probability via log5
  let prob = log5WinProbability(teamBlended, oppBlended);

  // Adjust for home field
  prob = adjustForHomeField(prob, isHome);

  // Adjust for pitching matchup (FIP-based)
  prob += pitcherAdjustment(teamPitcherFIP, opponentPitcherFIP);

  // Final clamp
  return Math.max(0.01, Math.min(0.99, prob));
}

export function rankTeamsForWeek(
  schedule: ScheduleGame[],
  standings: Map<number, StandingsTeamRecord>,
  pitcherStats: Map<number, PitcherSeasonStats>,
  recentStats: Map<number, RecentTeamStats>,
  usedTeamIds: Set<number>,
  futureAvgExpWins?: Map<number, number>
): TeamWeekAnalysis[] {
  // Phase 1: Compute home team win probability for each game once.
  // Away team gets 1 - P, guaranteeing total expected wins = total games.
  const gameProbs = new Map<
    number,
    { homeWinProb: number; homePitcherAdj: number; awayPitcherAdj: number }
  >();

  for (const game of schedule) {
    const homeId = game.teams.home.team.id;
    const awayId = game.teams.away.team.id;

    const homeStanding = standings.get(homeId);
    const awayStanding = standings.get(awayId);
    const homeGamesPlayed = homeStanding ? homeStanding.wins + homeStanding.losses : 0;
    const awayGamesPlayed = awayStanding ? awayStanding.wins + awayStanding.losses : 0;
    const homePythagRaw = homeStanding
      ? pythagoreanWinPct(homeStanding.runsScored, homeStanding.runsAllowed)
      : 0.5;
    const awayPythagRaw = awayStanding
      ? pythagoreanWinPct(awayStanding.runsScored, awayStanding.runsAllowed)
      : 0.5;
    // Regress toward .500 based on sample size
    const homePythag = regressToMean(homePythagRaw, homeGamesPlayed);
    const awayPythag = regressToMean(awayPythagRaw, awayGamesPlayed);

    const homeRecent = recentStats.get(homeId);
    const awayRecent = recentStats.get(awayId);
    const homeRecentPythag = homeRecent && homeRecent.gamesPlayed >= 3
      ? regressToMean(
          pythagoreanWinPct(homeRecent.runsScored, homeRecent.runsAllowed),
          homeRecent.gamesPlayed
        )
      : null;
    const awayRecentPythag = awayRecent && awayRecent.gamesPlayed >= 3
      ? regressToMean(
          pythagoreanWinPct(awayRecent.runsScored, awayRecent.runsAllowed),
          awayRecent.gamesPlayed
        )
      : null;

    const homePitcher = game.teams.home.probablePitcher;
    const awayPitcher = game.teams.away.probablePitcher;
    const homePitcherFIP = homePitcher
      ? pitcherStats.get(homePitcher.id)?.fip ?? null
      : null;
    const awayPitcherFIP = awayPitcher
      ? pitcherStats.get(awayPitcher.id)?.fip ?? null
      : null;

    // Compute home team win probability using all factors
    const homeWinProb = calculateGameWinProbability(
      homePythag,
      awayPythag,
      true,
      homePitcherFIP,
      awayPitcherFIP,
      homeRecentPythag,
      awayRecentPythag
    );

    gameProbs.set(game.gamePk, {
      homeWinProb,
      homePitcherAdj: pitcherAdjustment(homePitcherFIP, awayPitcherFIP),
      awayPitcherAdj: pitcherAdjustment(awayPitcherFIP, homePitcherFIP),
    });
  }

  // Phase 2: Group games by team using precomputed probabilities
  const teamGames = new Map<
    number,
    { team: { id: number; name: string; abbreviation: string }; games: { game: ScheduleGame; isHome: boolean }[] }
  >();

  for (const game of schedule) {
    const homeTeam = game.teams.home.team;
    const awayTeam = game.teams.away.team;

    if (!teamGames.has(homeTeam.id)) {
      teamGames.set(homeTeam.id, {
        team: { id: homeTeam.id, name: homeTeam.name, abbreviation: homeTeam.abbreviation },
        games: [],
      });
    }
    teamGames.get(homeTeam.id)!.games.push({ game, isHome: true });

    if (!teamGames.has(awayTeam.id)) {
      teamGames.set(awayTeam.id, {
        team: { id: awayTeam.id, name: awayTeam.name, abbreviation: awayTeam.abbreviation },
        games: [],
      });
    }
    teamGames.get(awayTeam.id)!.games.push({ game, isHome: false });
  }

  const analyses: TeamWeekAnalysis[] = [];

  for (const [teamId, { team, games }] of teamGames) {
    const teamStanding = standings.get(teamId);
    const teamGamesPlayed = teamStanding ? teamStanding.wins + teamStanding.losses : 0;
    const teamPythag = teamStanding
      ? regressToMean(
          pythagoreanWinPct(teamStanding.runsScored, teamStanding.runsAllowed),
          teamGamesPlayed
        )
      : 0.5;

    const teamRecent = recentStats.get(teamId);
    const teamRecentPythag = teamRecent && teamRecent.gamesPlayed >= 3
      ? regressToMean(
          pythagoreanWinPct(teamRecent.runsScored, teamRecent.runsAllowed),
          teamRecent.gamesPlayed
        )
      : null;

    let homeGames = 0;
    let awayGames = 0;
    let totalExpWins = 0;
    let totalOppStrength = 0;
    const gameAnalyses: GameAnalysis[] = [];

    for (const { game, isHome } of games) {
      if (isHome) homeGames++;
      else awayGames++;

      const oppTeam = isHome ? game.teams.away.team : game.teams.home.team;
      const oppStanding = standings.get(oppTeam.id);
      const oppGamesPlayed = oppStanding ? oppStanding.wins + oppStanding.losses : 0;
      const oppPythag = oppStanding
        ? regressToMean(
            pythagoreanWinPct(oppStanding.runsScored, oppStanding.runsAllowed),
            oppGamesPlayed
          )
        : 0.5;

      totalOppStrength += oppPythag;

      const probs = gameProbs.get(game.gamePk)!;
      // Home team uses homeWinProb, away team uses 1 - homeWinProb
      const winProb = isHome ? probs.homeWinProb : 1 - probs.homeWinProb;
      const pAdj = isHome ? probs.homePitcherAdj : probs.awayPitcherAdj;

      totalExpWins += winProb;

      const teamPitcher = isHome
        ? game.teams.home.probablePitcher
        : game.teams.away.probablePitcher;
      const oppPitcher = isHome
        ? game.teams.away.probablePitcher
        : game.teams.home.probablePitcher;

      gameAnalyses.push({
        gamePk: game.gamePk,
        date: game.officialDate,
        opponent: oppTeam,
        isHome,
        winProbability: winProb,
        opponentPythagWinPct: oppPythag,
        probablePitcher: teamPitcher?.fullName,
        opponentProbablePitcher: oppPitcher?.fullName,
        pitcherAdjustment: pAdj,
      });
    }

    const gamesCount = games.length;
    analyses.push({
      teamId,
      teamName: team.name,
      teamAbbreviation: team.abbreviation,
      gamesThisWeek: gamesCount,
      homeGames,
      awayGames,
      pythagoreanWinPct: teamPythag,
      recentFormWinPct: teamRecentPythag,
      blendedWinPct: blendWithRecentForm(teamPythag, teamRecentPythag),
      avgOpponentStrength:
        gamesCount > 0 ? totalOppStrength / gamesCount : 0.5,
      expectedWins: totalExpWins,
      spikeValue: futureAvgExpWins?.has(teamId)
        ? totalExpWins - futureAvgExpWins.get(teamId)!
        : null,
      avgFutureExpWins: futureAvgExpWins?.get(teamId) ?? null,
      games: gameAnalyses.sort(
        (a, b) => a.date.localeCompare(b.date)
      ),
      isUsed: usedTeamIds.has(teamId),
    });
  }

  // Sort: available teams by spike value (if available), else expected wins
  analyses.sort((a, b) => {
    if (a.isUsed !== b.isUsed) return a.isUsed ? 1 : -1;
    // If we have spike data, sort by spike value
    if (a.spikeValue !== null && b.spikeValue !== null) {
      return b.spikeValue - a.spikeValue;
    }
    return b.expectedWins - a.expectedWins;
  });

  return analyses;
}

/**
 * Compute average expected wins per team across multiple future weeks.
 * Uses base model only (no pitcher data — too far out to know starters).
 * Returns Map<teamId, avgExpectedWins>.
 */
export function computeFutureAvgExpWins(
  futureWeekSchedules: ScheduleGame[][],
  standings: Map<number, StandingsTeamRecord>,
  recentStats: Map<number, RecentTeamStats>
): Map<number, number> {
  // Accumulate expected wins per team across all future weeks
  const teamTotals = new Map<number, { total: number; weeks: number }>();

  const emptyPitchers = new Map<number, PitcherSeasonStats>();
  const emptyUsed = new Set<number>();

  for (const weekSchedule of futureWeekSchedules) {
    if (weekSchedule.length === 0) continue;

    const weekRankings = rankTeamsForWeek(
      weekSchedule,
      standings,
      emptyPitchers,
      recentStats,
      emptyUsed
    );

    for (const team of weekRankings) {
      const existing = teamTotals.get(team.teamId) || { total: 0, weeks: 0 };
      existing.total += team.expectedWins;
      existing.weeks += 1;
      teamTotals.set(team.teamId, existing);
    }
  }

  const avgMap = new Map<number, number>();
  for (const [teamId, { total, weeks }] of teamTotals) {
    avgMap.set(teamId, weeks > 0 ? total / weeks : 0);
  }
  return avgMap;
}
