// Backtest: which pre-week signal would have picked the season's "weekly winners"?
//
// A BiffleBall weekly winner is a team that won 5, 6, or 7 games in a single
// Mon–Sun week. This script reconstructs, for every completed week of the
// season, the signals that were knowable BEFORE that week started (no
// lookahead), then measures which of those signals actually separate the
// winners from the field.
//
// Point-in-time trick: we pull each team's full regular-season game log once,
// then recompute season record, 14-day recent form, opponent quality, and that
// week's schedule/results as of any date — so every input is exactly what you
// could have known on the Monday morning of that week.
//
// Run: node scripts/backtest-weekly-winners.mjs [YYYY-MM-DD cutoff]

const API = "https://statsapi.mlb.com/api/v1";
const TODAY = process.argv[2] || new Date().toISOString().split("T")[0];
const SEASON_START = "2026-03-23"; // Monday of week 1 (see lib/constants.ts)
const SEASON_END = "2026-09-27";

// Scoring params mirror lib/constants.ts / lib/scoring.ts.
const PYTH_EXP = 2, REGRESSION_GAMES = 25, HFA = 0.04, RECENT_W = 0.3;
const pythag = (rs, ra) => (rs + ra === 0 ? 0.5 : rs ** PYTH_EXP / (rs ** PYTH_EXP + ra ** PYTH_EXP));
const regress = (p, gp, rg = REGRESSION_GAMES) => (rg === 0 ? p : (gp / (gp + rg)) * p + (1 - gp / (gp + rg)) * 0.5);
const log5 = (a, b) => { const d = a + b - 2 * a * b; return d === 0 ? 0.5 : (a - a * b) / d; };
const homeAdj = (p, home) => Math.max(0.01, Math.min(0.99, home ? p + HFA : p - HFA));
const blend = (s, r) => (r === null ? s : s * (1 - RECENT_W) + r * RECENT_W);
const pct = (x) => (x * 100).toFixed(0) + "%";

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw new Error("fetch failed: " + url);
}

function weeks() {
  const out = [];
  const fmt = (d) => d.toISOString().split("T")[0];
  let cur = new Date(SEASON_START + "T00:00:00Z");
  const end = new Date(SEASON_END + "T00:00:00Z");
  let n = 1;
  while (cur <= end) {
    const s = new Date(cur), e = new Date(cur);
    e.setUTCDate(e.getUTCDate() + 6);
    out.push({ weekNumber: n, startDate: fmt(s), endDate: fmt(e) });
    cur.setUTCDate(cur.getUTCDate() + 7); n++;
  }
  return out;
}

async function main() {
  const teamsData = await getJSON(`${API}/teams?sportId=1`);
  const teams = teamsData.teams.filter((t) => t.active && t.sport?.id === 1);
  const abbr = new Map(teams.map((t) => [t.id, t.abbreviation]));

  // One full-season game log per team.
  const logs = new Map();
  await Promise.all(teams.map(async (t) => {
    const d = await getJSON(`${API}/schedule?sportId=1&teamId=${t.id}&startDate=2026-03-01&endDate=${TODAY}&gameType=R`);
    const games = [];
    for (const de of d.dates || []) for (const g of de.games || []) {
      if (g.status?.abstractGameState !== "Final" || g.gameType !== "R") continue;
      const home = g.teams.home.team.id === t.id;
      const me = home ? g.teams.home : g.teams.away, opp = home ? g.teams.away : g.teams.home;
      if (me.score == null || opp.score == null) continue;
      games.push({ date: g.officialDate, oppId: opp.team.id, isHome: home, rs: me.score, ra: opp.score, win: !!me.isWinner });
    }
    games.sort((a, b) => a.date.localeCompare(b.date));
    logs.set(t.id, games);
  }));

  const seasonAsOf = (id, date) => {
    let w = 0, l = 0, rs = 0, ra = 0;
    for (const x of logs.get(id) || []) { if (x.date >= date) break; x.win ? w++ : l++; rs += x.rs; ra += x.ra; }
    return { w, l, gp: w + l, rs, ra };
  };
  const recentAsOf = (id, date) => {
    const start = new Date(date + "T00:00:00Z"); start.setUTCDate(start.getUTCDate() - 14);
    const s = start.toISOString().split("T")[0];
    let w = 0, l = 0, rs = 0, ra = 0;
    for (const x of logs.get(id) || []) { if (x.date >= date) break; if (x.date < s) continue; x.win ? w++ : l++; rs += x.rs; ra += x.ra; }
    return { w, l, gp: w + l, rs, ra };
  };
  const teamPythag = (id, date) => { const a = seasonAsOf(id, date); return { pct: regress(pythag(a.rs, a.ra), a.gp), gp: a.gp, w: a.w, l: a.l }; };
  const recentPythag = (id, date) => { const r = recentAsOf(id, date); return r.gp < 3 ? null : regress(pythag(r.rs, r.ra), r.gp); };

  const wk = weeks().filter((w) => w.endDate < TODAY && w.startDate >= SEASON_START);
  const perWeek = [];
  for (const w of wk) {
    const rows = [];
    for (const t of teams) {
      const games = (logs.get(t.id) || []).filter((x) => x.date >= w.startDate && x.date <= w.endDate);
      if (!games.length) continue;
      const tp = teamPythag(t.id, w.startDate), trp = recentPythag(t.id, w.startDate);
      const tBlend = blend(tp.pct, trp);
      let expWins = 0, oppSum = 0, homeGames = 0;
      for (const g of games) {
        if (g.isHome) homeGames++;
        const op = teamPythag(g.oppId, w.startDate), orp = recentPythag(g.oppId, w.startDate);
        oppSum += op.pct;
        expWins += homeAdj(log5(tBlend, blend(op.pct, orp)), g.isHome);
      }
      rows.push({
        abbr: abbr.get(t.id), gamesThisWeek: games.length, homeGames,
        actualWins: games.filter((g) => g.win).length,
        seasonWinPct: tp.gp ? tp.w / tp.gp : 0.5, blended: tBlend,
        recentPythag: trp, avgOppStrength: oppSum / games.length,
        expectedWins: expWins, expWinRate: expWins / games.length,
      });
    }
    rows.sort((a, b) => b.expectedWins - a.expectedWins).forEach((r, i) => (r.rankExpWins = i + 1));
    [...rows].sort((a, b) => b.expWinRate - a.expWinRate).forEach((r, i) => (r.rankExpRate = i + 1));
    perWeek.push({ week: w.weekNumber, rows });
  }

  const all = perWeek.flatMap((p) => p.rows);
  const winners = all.filter((r) => r.actualWins >= 5);
  const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;

  // ---- Report ----
  console.log(`\nBiffleBall weekly-winner backtest — ${perWeek.length} completed weeks, ${all.length} team-weeks\n`);

  console.log("P(win 5+) by games scheduled that week:");
  for (const n of [7, 6, 5]) {
    const g = all.filter((r) => (n === 5 ? r.gamesThisWeek <= 5 : r.gamesThisWeek === n));
    const w = g.filter((r) => r.actualWins >= 5).length;
    console.log(`  ${n === 5 ? "<=5" : n}-game weeks: ${pct(w / g.length)} (${w}/${g.length})`);
  }

  console.log("\nCorrelation of each pre-week signal with actual wins (all team-weeks):");
  const corr = (f) => { const xs = all.map(f), ys = all.map((r) => r.actualWins); const mx = avg(all, f), my = avg(all, (r) => r.actualWins); let n = 0, dx = 0, dy = 0; for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; } return n / Math.sqrt(dx * dy); };
  for (const [name, f] of [["gamesThisWeek", (r) => r.gamesThisWeek], ["expectedWins (model)", (r) => r.expectedWins], ["blended quality", (r) => r.blended], ["recent form", (r) => r.recentPythag ?? 0.5], ["home games", (r) => r.homeGames], ["avg opp strength", (r) => r.avgOppStrength], ["season win%", (r) => r.seasonWinPct]])
    console.log(`  ${name.padEnd(22)} ${corr(f).toFixed(3)}`);

  console.log("\nWinners (5+) vs field — average of each feature:");
  console.log(`  ${"feature".padEnd(18)}${"winners".padStart(9)}${"field".padStart(9)}`);
  const field = all.filter((r) => r.actualWins < 5);
  for (const [name, f] of [["games/week", (r) => r.gamesThisWeek], ["home games", (r) => r.homeGames], ["season win%", (r) => r.seasonWinPct], ["blended quality", (r) => r.blended], ["avg opp strength", (r) => r.avgOppStrength], ["expected wins", (r) => r.expectedWins]])
    console.log(`  ${name.padEnd(18)}${avg(winners, f).toFixed(3).padStart(9)}${avg(field, f).toFixed(3).padStart(9)}`);

  console.log("\nIf you always picked the #1 team by a signal:");
  const strat = (label, cmp) => {
    let sum = 0, five = 0, top3 = 0, wk = 0;
    for (const p of perWeek) {
      const s = p.rows.slice().sort(cmp); sum += s[0].actualWins; if (s[0].actualWins >= 5) five++;
      if (p.rows.some((r) => r.actualWins >= 5)) { wk++; if (s.slice(0, 3).some((r) => r.actualWins >= 5)) top3++; }
    }
    console.log(`  ${label.padEnd(34)} avg ${(sum / perWeek.length).toFixed(2)} wins | picked a 5+ team ${five}/${perWeek.length} weeks | 5+ in top-3 ${top3}/${wk}`);
  };
  strat("expected wins (app default)", (a, b) => b.expectedWins - a.expectedWins);
  strat("expected win RATE", (a, b) => b.expWinRate - a.expWinRate);
  strat("most games, tie=best team", (a, b) => b.gamesThisWeek - a.gamesThisWeek || b.blended - a.blended);
  strat("season win% only", (a, b) => b.seasonWinPct - a.seasonWinPct);

  const base = winners.length / all.length;
  console.log(`\nBase rate P(5+ wins): ${pct(base)} (${winners.length}/${all.length})`);
  console.log(`Winners on a 6+ game week: ${pct(winners.filter((r) => r.gamesThisWeek >= 6).length / winners.length)}`);
  console.log(`Winners that were sub-.500 teams: ${pct(winners.filter((r) => r.seasonWinPct < 0.5).length / winners.length)}`);
  console.log("");
}
main().catch((e) => { console.error(e); process.exit(1); });
