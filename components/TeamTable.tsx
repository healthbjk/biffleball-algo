"use client";

import { useState } from "react";
import { TeamWeekAnalysis } from "@/lib/types";

type SortKey =
  | "expectedWins"
  | "spikeValue"
  | "gamesThisWeek"
  | "blendedWinPct"
  | "recentFormWinPct"
  | "avgOpponentStrength"
  | "homeGames"
  | "teamName";

interface TeamTableProps {
  data: TeamWeekAnalysis[];
  onToggleUsed: (teamId: number) => void;
  loading: boolean;
}

function pctDisplay(pct: number): string {
  return (pct * 1000).toFixed(0).padStart(3, "0").replace(/^(\d)/, ".$1");
}

const BASE_COLS = "32px minmax(150px, 1fr) 28px 56px 56px 76px 48px 60px";
const SPIKE_COLS = "32px minmax(130px, 1fr) 28px 52px 52px 72px 44px 56px 56px";

export default function TeamTable({
  data,
  onToggleUsed,
  loading,
}: TeamTableProps) {
  const hasSpikeData = data.some((t) => t.spikeValue !== null);
  const [sortKey, setSortKey] = useState<SortKey>("expectedWins");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const gridCols = hasSpikeData ? SPIKE_COLS : BASE_COLS;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "teamName");
    }
  };

  const sorted = [...data].sort((a, b) => {
    if (a.isUsed !== b.isUsed) return a.isUsed ? 1 : -1;
    let cmp = 0;
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      cmp = aVal.localeCompare(bVal);
    } else {
      cmp = ((aVal as number) ?? 0) - ((bVal as number) ?? 0);
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortHeader = ({
    label,
    sortKeyName,
    className,
  }: {
    label: string;
    sortKeyName: SortKey;
    className?: string;
  }) => (
    <div
      className={`cursor-pointer select-none px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-200 ${className || ""}`}
      onClick={() => handleSort(sortKeyName)}
    >
      {label}
      {sortKey === sortKeyName && (
        <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading team data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">No games scheduled for this week.</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      {/* Header */}
      <div
        className="grid items-center gap-0 bg-gray-800"
        style={{ gridTemplateColumns: `${gridCols} 44px` }}
      >
        <div className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-400">
          #
        </div>
        <SortHeader label="Team" sortKeyName="teamName" />
        <SortHeader label="G" sortKeyName="gamesThisWeek" />
        <SortHeader label="Pyth%" sortKeyName="blendedWinPct" />
        <SortHeader label="Recent" sortKeyName="recentFormWinPct" />
        <SortHeader label="H / A" sortKeyName="homeGames" />
        <SortHeader label="Opp" sortKeyName="avgOpponentStrength" />
        <SortHeader label="Exp W" sortKeyName="expectedWins" className="font-bold" />
        {hasSpikeData && (
          <SortHeader label="Spike" sortKeyName="spikeValue" className="font-bold" />
        )}
        <div className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-400">
          Used
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-700 bg-gray-900">
        {sorted.map((team, idx) => {
          const isExpanded = expandedTeam === team.teamId;
          const availableRank = team.isUsed ? "—" : `${idx + 1}`;

          let expWinsColor = "text-gray-100";
          if (!team.isUsed) {
            if (idx < 5) expWinsColor = "text-green-400 font-semibold";
            else if (idx < 10) expWinsColor = "text-green-300";
          }

          return (
            <div key={team.teamId}>
              <div
                className={`grid items-center gap-0 ${
                  team.isUsed ? "opacity-40" : "hover:bg-gray-800/50 cursor-pointer"
                }`}
                style={{ gridTemplateColumns: `${gridCols} 44px` }}
                onClick={() =>
                  !team.isUsed && setExpandedTeam(isExpanded ? null : team.teamId)
                }
              >
                <div className="px-2 py-2.5 text-sm text-gray-500">
                  {availableRank}
                </div>
                <div className="px-2 py-2.5 text-sm font-medium text-gray-100">
                  {team.teamName}
                </div>
                <div className="px-2 py-2.5 text-sm text-center text-gray-300">
                  {team.gamesThisWeek}
                </div>
                <div className="px-2 py-2.5 text-sm text-gray-300 font-mono">
                  {pctDisplay(team.blendedWinPct)}
                </div>
                <div className="px-2 py-2.5 text-sm text-gray-300 font-mono">
                  {team.recentFormWinPct !== null ? pctDisplay(team.recentFormWinPct) : "—"}
                </div>
                <div className="px-2 py-2.5 text-sm text-gray-300">
                  {team.homeGames}H / {team.awayGames}A
                </div>
                <div className="px-2 py-2.5 text-sm text-gray-300 font-mono">
                  {pctDisplay(team.avgOpponentStrength)}
                </div>
                <div className={`px-2 py-2.5 text-sm font-mono ${expWinsColor}`}>
                  {team.expectedWins.toFixed(2)}
                </div>
                {hasSpikeData && (
                  <div
                    className={`px-2 py-2.5 text-sm font-mono ${
                      team.spikeValue !== null
                        ? team.spikeValue > 0.3
                          ? "text-green-400 font-semibold"
                          : team.spikeValue > 0
                            ? "text-green-300"
                            : team.spikeValue < -0.3
                              ? "text-red-400"
                              : "text-gray-400"
                        : "text-gray-600"
                    }`}
                  >
                    {team.spikeValue !== null
                      ? `${team.spikeValue >= 0 ? "+" : ""}${team.spikeValue.toFixed(2)}`
                      : "—"}
                  </div>
                )}
                <div className="px-2 py-2.5 flex justify-center">
                  <input
                    type="checkbox"
                    checked={team.isUsed}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleUsed(team.teamId);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                  />
                </div>
              </div>

              {/* Expanded game-by-game breakdown */}
              {isExpanded && !team.isUsed && (
                <div className="bg-gray-800/70 px-6 py-3 border-t border-gray-700">
                  {team.avgFutureExpWins !== null && (
                    <div className="mb-2 text-xs text-gray-400">
                      Avg future week:{" "}
                      <span className="font-mono text-gray-300">
                        {team.avgFutureExpWins.toFixed(2)}
                      </span>{" "}
                      exp wins
                      {team.spikeValue !== null && (
                        <span className="ml-2">
                          — this week is{" "}
                          <span
                            className={
                              team.spikeValue > 0 ? "text-green-400" : "text-red-400"
                            }
                          >
                            {team.spikeValue > 0 ? "above" : "below"} avg by{" "}
                            {Math.abs(team.spikeValue).toFixed(2)}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-1 pr-4">Date</th>
                        <th className="text-left py-1 pr-4">vs</th>
                        <th className="text-left py-1 pr-4">Loc</th>
                        <th className="text-left py-1 pr-4">Pitcher</th>
                        <th className="text-left py-1 pr-4">vs Pitcher</th>
                        <th className="text-left py-1 pr-4">Opp Str</th>
                        <th className="text-left py-1 pr-4">Pitch Adj</th>
                        <th className="text-left py-1">Win%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.games.map((g) => (
                        <tr key={g.gamePk} className="text-gray-300">
                          <td className="py-1 pr-4">
                            {new Date(g.date + "T12:00:00").toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="py-1 pr-4">
                            {g.opponent.abbreviation || g.opponent.name}
                          </td>
                          <td className="py-1 pr-4">
                            <span
                              className={g.isHome ? "text-green-400" : "text-gray-500"}
                            >
                              {g.isHome ? "HOME" : "AWAY"}
                            </span>
                          </td>
                          <td className="py-1 pr-4">
                            {g.probablePitcher || "TBD"}
                          </td>
                          <td className="py-1 pr-4">
                            {g.opponentProbablePitcher || "TBD"}
                          </td>
                          <td className="py-1 pr-4 font-mono">
                            {pctDisplay(g.opponentPythagWinPct)}
                          </td>
                          <td className="py-1 pr-4 font-mono">
                            <span
                              className={
                                g.pitcherAdjustment > 0
                                  ? "text-green-400"
                                  : g.pitcherAdjustment < 0
                                    ? "text-red-400"
                                    : "text-gray-500"
                              }
                            >
                              {g.pitcherAdjustment >= 0 ? "+" : ""}
                              {(g.pitcherAdjustment * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-1 font-mono font-medium">
                            {(g.winProbability * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
