import { SeasonWeek, ScoringWeights } from "./types";

export const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";

// Non-tunable constants
export const PYTHAGOREAN_EXPONENT = 2;
export const LEAGUE_AVG_ERA = 4.0;

// User-tunable defaults.
// Tuned against the first-half weekly-winner backtest (see
// docs/weekly-winners-backtest.md and scripts/backtest-weekly-winners.mjs).
// Winners are driven by schedule shape (volume, home games, matchup), not by
// which team has the better record — season win% correlates ~0 with weekly
// wins. So the weights de-weight raw record: heavier regression toward .500,
// lighter recent-form, stronger home-field. This lifted the top pick's average
// actual wins from 3.93 to ~4.07 over 15 weeks. pitcherAdjustmentMax is kept
// modest — it's a per-game signal that largely averages out over a full week
// and could not be evaluated point-in-time.
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  homeFieldAdvantage: 0.08,
  recentFormWeight: 0.15,
  pitcherAdjustmentMax: 0.04,
  regressionGames: 100,
};

// 2026 MLB season weeks (Monday-Sunday blocks)
// Opening Day is March 26, 2026. Season ends September 27, 2026.
function generateSeasonWeeks(): SeasonWeek[] {
  const weeks: SeasonWeek[] = [];
  // Week 1 starts on the Monday before opening day
  let current = new Date("2026-03-23");
  const seasonEnd = new Date("2026-09-27");
  let weekNum = 1;

  while (current <= seasonEnd) {
    const start = new Date(current);
    const end = new Date(current);
    end.setDate(end.getDate() + 6);

    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const shortFmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    weeks.push({
      weekNumber: weekNum,
      startDate: fmt(start),
      endDate: fmt(end),
      label: `Week ${weekNum}: ${shortFmt(start)} – ${shortFmt(end)}`,
    });

    current.setDate(current.getDate() + 7);
    weekNum++;
  }

  return weeks;
}

export const SEASON_WEEKS = generateSeasonWeeks();

export function getCurrentWeekIndex(): number {
  const today = new Date().toISOString().split("T")[0];
  const idx = SEASON_WEEKS.findIndex(
    (w) => today >= w.startDate && today <= w.endDate
  );
  return idx >= 0 ? idx : 0;
}
