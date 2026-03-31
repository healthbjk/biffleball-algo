// MLB API response types

export interface MLBTeam {
  id: number;
  name: string;
  abbreviation: string;
  link: string;
}

export interface LeagueRecord {
  wins: number;
  losses: number;
  pct: string;
}

export interface ScheduleGame {
  gamePk: number;
  officialDate: string;
  dayNight: "day" | "night";
  gameType: string;
  status: {
    abstractGameState: string;
    detailedState: string;
  };
  teams: {
    away: {
      team: MLBTeam;
      leagueRecord: LeagueRecord;
      probablePitcher?: { id: number; fullName: string; link: string };
      score?: number;
      isWinner?: boolean;
    };
    home: {
      team: MLBTeam;
      leagueRecord: LeagueRecord;
      probablePitcher?: { id: number; fullName: string; link: string };
      score?: number;
      isWinner?: boolean;
    };
  };
  venue: { id: number; name: string };
}

export interface SplitRecord {
  wins: number;
  losses: number;
  type: string;
  pct: string;
}

export interface StandingsTeamRecord {
  team: MLBTeam;
  wins: number;
  losses: number;
  winningPercentage: string;
  runDifferential: number;
  runsScored: number;
  runsAllowed: number;
  streak: {
    streakCode: string;
    streakType: string;
    streakNumber: number;
  };
  records: {
    splitRecords: SplitRecord[];
  };
}

export interface PitcherSeasonStats {
  pitcherId: number;
  fullName: string;
  era: number;
  fip: number;
  whip: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  strikeOuts: number;
  baseOnBalls: number;
  homeRuns: number;
}

export interface RecentTeamStats {
  teamId: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  runsScored: number;
  runsAllowed: number;
  recentWinPct: number;
  recentRunDifferentialPerGame: number;
}

// App-level types

export interface GameAnalysis {
  gamePk: number;
  date: string;
  opponent: MLBTeam;
  isHome: boolean;
  winProbability: number;
  opponentPythagWinPct: number;
  probablePitcher?: string;
  opponentProbablePitcher?: string;
  pitcherAdjustment: number;
}

export interface TeamWeekAnalysis {
  teamId: number;
  teamName: string;
  teamAbbreviation: string;
  gamesThisWeek: number;
  homeGames: number;
  awayGames: number;
  pythagoreanWinPct: number;
  recentFormWinPct: number | null;
  blendedWinPct: number;
  avgOpponentStrength: number;
  expectedWins: number;
  spikeValue: number | null;
  avgFutureExpWins: number | null;
  games: GameAnalysis[];
  isUsed: boolean;
}

export interface ScoringWeights {
  homeFieldAdvantage: number;
  recentFormWeight: number;
  pitcherAdjustmentMax: number;
  regressionGames: number;
}

export interface SeasonWeek {
  weekNumber: number;
  startDate: string;
  endDate: string;
  label: string;
}
