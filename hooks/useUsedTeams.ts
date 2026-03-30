"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "biffleball-used-teams";

export function useUsedTeams() {
  const [usedTeamIds, setUsedTeamIds] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const ids: number[] = JSON.parse(stored);
        setUsedTeamIds(new Set(ids));
      }
    } catch {
      // localStorage unavailable or invalid data
    }
    setLoaded(true);
  }, []);

  const toggleTeam = useCallback((teamId: number) => {
    setUsedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setUsedTeamIds(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { usedTeamIds, toggleTeam, clearAll, loaded };
}
