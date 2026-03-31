"use client";

import { useState } from "react";
import { ScoringWeights } from "@/lib/types";
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/constants";

interface WeightsPanelProps {
  weights: ScoringWeights;
  onUpdateWeight: <K extends keyof ScoringWeights>(
    key: K,
    value: ScoringWeights[K]
  ) => void;
  onReset: () => void;
}

interface SliderConfig {
  key: keyof ScoringWeights;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderConfig[] = [
  {
    key: "homeFieldAdvantage",
    label: "Home Field Advantage",
    min: 0,
    max: 0.1,
    step: 0.005,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "recentFormWeight",
    label: "Recent Form Weight",
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "pitcherAdjustmentMax",
    label: "Max Pitcher Adjustment",
    min: 0,
    max: 0.15,
    step: 0.005,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "regressionGames",
    label: "Regression Games",
    min: 0,
    max: 80,
    step: 5,
    format: (v) => `${v}`,
  },
];

export default function WeightsPanel({
  weights,
  onUpdateWeight,
  onReset,
}: WeightsPanelProps) {
  const [open, setOpen] = useState(false);

  const isDefault = (key: keyof ScoringWeights) =>
    weights[key] === DEFAULT_SCORING_WEIGHTS[key];

  const allDefault = SLIDERS.every((s) => isDefault(s.key));

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:text-gray-100"
      >
        <span className="font-medium">Model Weights</span>
        <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-700 px-4 py-3 space-y-4">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">{s.label}</label>
                <span
                  className={`text-xs font-mono ${
                    isDefault(s.key) ? "text-gray-400" : "text-blue-400"
                  }`}
                >
                  {s.format(weights[s.key])}
                </span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={weights[s.key]}
                onChange={(e) =>
                  onUpdateWeight(s.key, parseFloat(e.target.value))
                }
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-600 accent-blue-500"
              />
            </div>
          ))}
          {!allDefault && (
            <button
              onClick={onReset}
              className="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              Reset to defaults
            </button>
          )}
        </div>
      )}
    </div>
  );
}
