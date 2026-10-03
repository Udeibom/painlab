"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import type { Experiment } from "@prisma/client";

interface ResultFormProps {
  painCaseId: string;
  experiments: Experiment[];
  onClose: () => void;
}

export function ResultForm({
  painCaseId,
  experiments,
  onClose,
}: ResultFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/experiment-results", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save result");
        setPending(false);
        return;
      }
      onClose();
      window.location.reload();
    } catch {
      setError("Something went wrong");
      setPending(false);
    }
  }

  // Filter to experiments that don't have a result yet
  const availableExperiments = experiments.filter((e) => !(e as { result?: unknown }).result);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="experimentId"
          className="block text-sm font-medium text-stone-700"
        >
          Which experiment is this result for?
        </label>
        <select
          id="experimentId"
          name="experimentId"
          required
          autoFocus
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        >
          <option value="">Select an experiment...</option>
          {availableExperiments.map((exp) => (
            <option key={exp.id} value={exp.id}>
              {exp.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="whatHappened"
          className="block text-sm font-medium text-stone-700"
        >
          What happened?
        </label>
        <p className="text-xs text-stone-400">
          A factual account of what occurred — not what it means or what you
          concluded. That comes later, as a Learning.
        </p>
        <textarea
          id="whatHappened"
          name="whatHappened"
          required
          maxLength={10000}
          rows={4}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="Describe what actually happened — facts, not interpretation..."
        />
      </div>

      <div>
        <label
          htmlFor="outcome"
          className="block text-sm font-medium text-stone-700"
        >
          Outcome (optional)
        </label>
        <select
          id="outcome"
          name="outcome"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        >
          <option value="">Select if applicable...</option>
          <option value="AS_EXPECTED">As expected</option>
          <option value="UNEXPECTED">Unexpected</option>
          <option value="INCONCLUSIVE">Inconclusive</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="unexpectedEffects"
          className="block text-sm font-medium text-stone-700"
        >
          Unexpected effects (optional)
        </label>
        <textarea
          id="unexpectedEffects"
          name="unexpectedEffects"
          maxLength={5000}
          rows={2}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="Anything you didn't anticipate?"
        />
      </div>

      <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2">
        <p className="text-xs text-emerald-800">
          <span className="font-medium">
            Recording a result does not change your hypothesis status.
          </span>{" "}
          Interpretation is a separate, deliberate step. You decide what the
          result means.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save result"}
        </Button>
      </div>
    </form>
  );
}
