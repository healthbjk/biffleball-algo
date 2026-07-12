# Betting-Market Odds (optional)

The backtest showed the biggest remaining signal we *don't* capture is the
betting market — a de-vigged moneyline already prices in lineups, injuries,
bullpen, weather, and park. This feature blends that market probability into the
model, and it's fully **opt-in**.

## How to turn it on

1. Get a free API key at [the-odds-api.com](https://the-odds-api.com/) (the
   500-requests/month tier is plenty for one user).
2. Set it in the environment before starting the app:
   ```bash
   ODDS_API_KEY=your_key_here
   ```
   (See `.env.example`.)
3. In the app, click **Betting Odds: Off → On**. The toggle is remembered
   per-browser.

If the toggle is on but no key is configured, the app tells you and keeps
running the pure model — nothing breaks.

## What it does

For each game that has a posted line, the app:

1. Converts both American moneylines to implied probabilities.
2. **De-vigs** them — normalizes the two sides to sum to 1, removing the book's
   margin — to recover the market's true win probability.
3. Averages across books for a consensus, then blends it with the model's
   per-game probability:
   ```
   winProb = marketWeight × market + (1 − marketWeight) × model
   ```
   `marketWeight` is a slider (default 70%). Everything downstream — expected
   wins, ranking, the survivor spike — is unchanged; it just consumes a sharper
   per-game number.

## The one real limitation

Sportsbooks post MLB lines only **~1 day ahead** (they firm up once starting
pitchers are confirmed). Since BiffleBall picks are made on Monday for the whole
week, **only the first game or two will have odds** — the rest of the week falls
back to the model automatically. So this sharpens near-term games rather than
replacing the model. The in-app banner shows how many games got a line.

## Files

- `lib/odds.ts` — `americanToImplied`, `devig`, team-name matching.
- `lib/mlb.ts` — `fetchGameOdds()` fetches lines and joins them to gamePks.
- `app/api/odds/route.ts` — API route; returns `{ disabled: true }` when no key.
- `lib/scoring.ts` — `calculateGameWinProbability` blends in the market prob.
- `hooks/useMarketOdds.ts` — persisted on/off toggle (default off).

## Validating the lift

`the-odds-api.com` has a `/historical` endpoint. To measure how much odds
actually help, pull closing moneylines for completed weeks and re-run
`scripts/backtest-weekly-winners.mjs` with market-blended per-game probs,
comparing the top-pick metric against the model-only baseline.
