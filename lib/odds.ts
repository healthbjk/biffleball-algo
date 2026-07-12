// Betting-market helpers: convert American moneylines into de-vigged win
// probabilities and match odds events back to MLB games.

// American odds -> implied probability (includes the book's vig).
export function americanToImplied(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

// Remove the vig from a two-way market by normalizing both implied
// probabilities so they sum to 1. Returns the market's true home-win estimate.
export function devig(homeOdds: number, awayOdds: number): number {
  const h = americanToImplied(homeOdds);
  const a = americanToImplied(awayOdds);
  const total = h + a;
  if (total === 0) return 0.5;
  return h / total;
}

// Team-name matching between The Odds API (full names) and the MLB Stats API.
// Both use official names that usually match exactly; the fallback substring
// check handles cases like "Athletics" vs "Oakland Athletics".
export function teamsMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  return na === nb || na.includes(nb) || nb.includes(na);
}
