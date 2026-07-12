# Weekly-Winners Backtest — What Would Have Picked Them?

_Analysis run at the season's halfway point (through Week 15, cutoff 2026-07-12).
Reproduce with `node scripts/backtest-weekly-winners.mjs`._

## The question

A **weekly winner** in BiffleBall is a team that won **5, 6, or 7 games** in a
single Mon–Sun week. We looked at every weekly winner in the first half and
asked: **what signal, knowable on Monday morning, would have pointed us at
them?**

## Method (no lookahead)

For all 15 completed weeks (450 team-weeks) we reconstructed each team's inputs
**as of the Monday the week began** — season record, Pythagorean win%, 14-day
recent form, opponent quality, home/away split, and the app's existing
`expectedWins` model — using only games that had already been played. We then
checked which of those pre-week signals actually separated the 62 winner-weeks
from the field.

## Headline findings

### 1. Schedule volume is the gate — it is not optional

| Games scheduled that week | P(team wins 5+) |
|---|---|
| 7-game week | **27%** (26/97) |
| 6-game week | 12% (36/308) |
| ≤5-game week | **0%** (0/45) |

**100% of the 62 weekly winners came from a 6- or 7-game week.** You cannot win
5 in a 4-game week, and even 5-game weeks produced zero winners this half.
`gamesThisWeek` is the single most predictive input we have (correlation 0.362
with actual wins) — essentially tied with the *entire* `expectedWins` model
(0.358). **A team playing only 5 games should never be your pick, no matter how
good it is.**

### 2. Raw team quality barely matters at the weekly level

- `seasonWinPct` correlation with weekly wins: **0.004** — noise.
- **45% of weekly winners were sub-.500 teams.** Winners averaged a .505 season
  record vs .500 for everyone else.
- Regressed/blended quality helps only a little (corr 0.115). Within 6+ game
  weeks, top-quartile-quality teams won 5+ 25% of the time — but the *bottom*
  quartile won 5+ 16% of the time, beating both middle quartiles, because weak
  teams draw soft schedules and one hot week erases the talent gap.

Picking "the best team" and ignoring the schedule was one of the *worst*
strategies (season-win%-only: a 5+ pick in just 4/15 weeks).

### 3. Opponent weakness and home-heavy slates are real but minor tilts

Winners faced slightly weaker opponents (avg opp strength 0.489 vs 0.502, corr
−0.05) and were 73% home-majority (home-games corr 0.128). Useful as
tie-breakers, not as primary drivers.

### 4. The app's `expectedWins` model is already the best single ranking

| Pick strategy (take the #1 team each week) | Avg actual wins | Weeks the pick won 5+ | A 5+ team in top-3 |
|---|---|---|---|
| **expected wins (app default)** | **3.93** | **7/15 (47%)** | 9/14 |
| expected win *rate* | 3.80 | 6/15 (40%) | **11/14 (79%)** |
| most games, tie = best team | 3.47 | 4/15 | 11/14 |
| season win% only | 3.40 | 4/15 | 8/14 |

Against a 14% base rate, the model's top pick hit a 5+ week **47% of the time —
a ~3.3× lift**. No reweighting we tried (7-game-first, weak-opponent tilt,
rate/volume blends) beat it on the single best pick. The model isn't broken.

## The algorithm that best matches the winners

There is no formula that reliably isolates the exact winner — a 5+ week is
substantially variance (even the best filter tops out near a 22% hit rate). What
the data *does* support is a disciplined pick rule:

1. **Hard-gate on volume.** Only consider teams playing **6 or 7 games**;
   prefer 7-game weeks. This is the biggest and most deterministic lever.
2. **Rank the survivors by `expectedWins`** (the app's log5 + home-field model).
   It already folds volume × matchup together and is the best single signal.
3. **Don't over-trust the standings.** A middling team on a soft 7-game,
   home-heavy slate is a *textbook* weekly winner; nearly half of them were
   sub-.500. Weight the matchup and the schedule over reputation.
4. **Treat it as a shortlist, not a lock.** The top ~3 by expected win *rate*
   contain a 5+ winner ~79% of weeks — a good "safe candidates" list — while
   `expectedWins` gives the best single pick because it rewards the 7-game
   volume. Use rate to shortlist, total to choose.

## Tuned default weights

Grid-searching the four `ScoringWeights` sliders (216 combos) against this same
backtest, all three tunable-and-testable weights point the same way — **trust
the standings less, trust the schedule shape more** — consistent with season
win% being ~useless week to week. The defaults in `lib/constants.ts` were
updated accordingly:

| Weight | Old | New | Why |
|---|---|---|---|
| `regressionGames` | 25 | **100** | Pull records harder toward .500 |
| `recentFormWeight` | 0.30 | **0.15** | Recent form is weak; cranking it hurt |
| `homeFieldAdvantage` | 0.04 | **0.08** | Home-heavy weeks win (winners 73% home-majority) |
| `pitcherAdjustmentMax` | 0.06 | **0.04** | Per-game signal; averages out over a week; untestable point-in-time |

This lifted the top pick's average actual wins from **3.93 → ~4.07** over 15
weeks. Note the spread across *all* combos is under one win, so settings are a
minor lever — the 6+ games gate matters far more.

## Caveats

- The backtest excludes the probable-pitcher FIP adjustment (max ±0.06), since
  reconstructing point-in-time FIP is noisy; its effect on ranking is small.
- One half-season (62 winner-weeks). Directionally strong, but re-run at
  season's end before hard-coding anything.

## Reproduce

```bash
node scripts/backtest-weekly-winners.mjs 2026-07-12
```

Pulls one full-season game log per team from the MLB Stats API and recomputes
every signal point-in-time — no external data files required.
