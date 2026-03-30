import { SeasonWeek } from "./types";

export const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";

// Scoring tuning parameters
export const HOME_FIELD_ADVANTAGE = 0.04;
export const PYTHAGOREAN_EXPONENT = 2;
export const RECENT_FORM_WEIGHT = 0.3; // 30% recent, 70% season
export const LEAGUE_AVG_ERA = 4.0; // approximate league average ERA
export const PITCHER_ADJUSTMENT_MAX = 0.06; // max +/- adjustment from pitcher quality

// Regression to the mean: how many games of .500 to mix in.
// With 40 regression games, a team that is 10-2 (.833 Pythag) after 12 games
// becomes (10 + 20) / (12 + 40) = 30/52 ≈ .577 — much more realistic.
// By mid-season (~80 games), regression is mild: 80/(80+40) = 67% real signal.
export const REGRESSION_GAMES = 25;

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
