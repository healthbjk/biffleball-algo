"use client";

import { useState, useEffect, useCallback } from "react";
import { ScoringWeights } from "@/lib/types";
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/constants";

const STORAGE_KEY = "biffleball-weights";

export function useWeights() {
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_SCORING_WEIGHTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setWeights({ ...DEFAULT_SCORING_WEIGHTS, ...parsed });
      }
    } catch {
      // localStorage unavailable or invalid data
    }
    setLoaded(true);
  }, []);

  const updateWeight = useCallback(
    <K extends keyof ScoringWeights>(key: K, value: ScoringWeights[K]) => {
      setWeights((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // localStorage unavailable
        }
        return next;
      });
    },
    []
  );

  const resetToDefaults = useCallback(() => {
    setWeights(DEFAULT_SCORING_WEIGHTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { weights, updateWeight, resetToDefaults, loaded };
}
