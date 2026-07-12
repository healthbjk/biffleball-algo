"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "biffleball-market-enabled";

// Persisted on/off toggle for blending betting-market odds into the model.
// Defaults to off so the app behaves identically until the user opts in (and
// the server also needs ODDS_API_KEY configured for odds to actually load).
export function useMarketOdds() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setEnabled(JSON.parse(stored) === true);
    } catch {
      // localStorage unavailable or invalid data
    }
    setLoaded(true);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  return { enabled, toggle, loaded };
}
