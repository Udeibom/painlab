"use client";

import { useState } from "react";
import { ObservationForm } from "./ObservationForm";
import { HypothesisForm } from "./HypothesisForm";
import { ExperimentForm } from "./ExperimentForm";
import { ResultForm } from "./ResultForm";
import { LearningForm } from "./LearningForm";
import type { Experiment } from "@prisma/client";

type EntryType = "observation" | "hypothesis" | "experiment" | "result" | "learning";

interface AddToInvestigationProps {
  painCaseId: string;
  experiments: Experiment[];
}

const typeDescriptions: Record<EntryType, { label: string; desc: string }> = {
  observation: {
    label: "Observation",
    desc: "Something you directly noticed or experienced",
  },
  hypothesis: {
    label: "Hypothesis",
    desc: "A possible explanation — not a fact",
  },
  experiment: {
    label: "Experiment",
    desc: "Something to try to learn something",
  },
  result: {
    label: "Result",
    desc: "What happened when you tested something",
  },
  learning: {
    label: "Learning",
    desc: "What you concluded from the investigation",
  },
};

const typeColors: Record<EntryType, string> = {
  observation: "text-sky-700 border-sky-300 bg-sky-50",
  hypothesis: "text-amber-700 border-amber-300 bg-amber-50",
  experiment: "text-violet-700 border-violet-300 bg-violet-50",
  result: "text-emerald-700 border-emerald-300 bg-emerald-50",
  learning: "text-rose-700 border-rose-300 bg-rose-50",
};

export function AddToInvestigation({
  painCaseId,
  experiments,
}: AddToInvestigationProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<EntryType | null>(null);

  function handleClose() {
    setOpen(false);
    setSelectedType(null);
  }

  function renderForm() {
    if (!selectedType) return null;

    switch (selectedType) {
      case "observation":
        return <ObservationForm painCaseId={painCaseId} onClose={handleClose} />;
      case "hypothesis":
        return <HypothesisForm painCaseId={painCaseId} onClose={handleClose} />;
      case "experiment":
        return <ExperimentForm painCaseId={painCaseId} onClose={handleClose} />;
      case "result":
        return (
          <ResultForm
            painCaseId={painCaseId}
            experiments={experiments}
            onClose={handleClose}
          />
        );
      case "learning":
        return <LearningForm painCaseId={painCaseId} onClose={handleClose} />;
    }
  }

  const allTypes: EntryType[] = [
    "observation",
    "hypothesis",
    "experiment",
    "result",
    "learning",
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
      >
        + Add to investigation
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-stone-900/40"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg border border-stone-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            {!selectedType ? (
              <>
                <h2 className="mb-1 text-lg font-semibold">
                  Add to investigation
                </h2>
                <p className="mb-4 text-sm text-stone-500">
                  Choose what you&apos;re adding. Each type plays a distinct role
                  in the investigation.
                </p>
                <div className="space-y-2">
                  {allTypes.map((type) => {
                    const info = typeDescriptions[type];
                    const isResultDisabled =
                      type === "result" && experiments.length === 0;

                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          if (!isResultDisabled) {
                            setSelectedType(type);
                          }
                        }}
                        disabled={isResultDisabled}
                        className={`w-full rounded-md border p-3 text-left transition-colors ${
                          isResultDisabled
                            ? "cursor-not-allowed border-stone-200 bg-stone-50 opacity-60"
                            : `cursor-pointer border-stone-200 hover:border-stone-400 ${typeColors[type]}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{info.label}</span>
                          {isResultDisabled && (
                            <span className="text-xs text-stone-400">
                              Create an Experiment first
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {info.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-sm text-stone-500 hover:text-stone-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedType(null)}
                    className="text-sm text-stone-500 hover:text-stone-700"
                  >
                    ← Back
                  </button>
                  <h2 className="text-lg font-semibold">
                    {typeDescriptions[selectedType].label}
                  </h2>
                </div>
                {renderForm()}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
