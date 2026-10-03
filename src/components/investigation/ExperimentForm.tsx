"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface ExperimentFormProps {
  painCaseId: string;
  onClose: () => void;
}

export function ExperimentForm({ painCaseId, onClose }: ExperimentFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("painCaseId", painCaseId);

    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save experiment");
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-stone-700"
        >
          Experiment title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          autoFocus
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="Short name for this experiment"
        />
      </div>

      <div>
        <label
          htmlFor="question"
          className="block text-sm font-medium text-stone-700"
        >
          What are you trying to learn?
        </label>
        <textarea
          id="question"
          name="question"
          required
          maxLength={5000}
          rows={3}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="What question will this experiment answer?"
        />
      </div>

      <div>
        <label
          htmlFor="procedure"
          className="block text-sm font-medium text-stone-700"
        >
          Procedure (optional)
        </label>
        <p className="text-xs text-stone-400">
          What exactly will you do?
        </p>
        <textarea
          id="procedure"
          name="procedure"
          maxLength={5000}
          rows={3}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="Step by step: what will you do?"
        />
      </div>

      <div>
        <label
          htmlFor="expectedOutcome"
          className="block text-sm font-medium text-stone-700"
        >
          Expected outcome (optional)
        </label>
        <p className="text-xs text-stone-400">
          What do you expect to happen? Record this before running the experiment.
        </p>
        <textarea
          id="expectedOutcome"
          name="expectedOutcome"
          maxLength={5000}
          rows={2}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="What you expect to happen — recorded before you run it"
        />
      </div>

      <div>
        <label
          htmlFor="startDate"
          className="block text-sm font-medium text-stone-700"
        >
          Start date (optional)
        </label>
        <input
          id="startDate"
          name="startDate"
          type="datetime-local"
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
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
          {pending ? "Saving..." : "Save experiment"}
        </Button>
      </div>
    </form>
  );
}
