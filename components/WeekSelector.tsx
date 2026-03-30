"use client";

import { SEASON_WEEKS, getCurrentWeekIndex } from "@/lib/constants";

interface WeekSelectorProps {
  selectedIndex: number;
  onChange: (index: number) => void;
}

export default function WeekSelector({
  selectedIndex,
  onChange,
}: WeekSelectorProps) {
  const currentIdx = getCurrentWeekIndex();

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="week-select" className="text-sm font-medium text-gray-300">
        Select Week
      </label>
      <select
        id="week-select"
        value={selectedIndex}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {SEASON_WEEKS.map((week, i) => (
          <option key={week.weekNumber} value={i}>
            {week.label}
            {i === currentIdx ? " (current)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
