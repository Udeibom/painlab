"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface LearningFormProps {
  painCaseId: string;
  onClose: () => void;
}

export function LearningForm({ painCaseId, onClose }: LearningFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("painCaseId", painCaseId);

    try {
      const res = await fetch("/api/learnings", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save learning");
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
          htmlFor="statement"
          className="block text-sm font-medium text-stone-700"
        >
          What did you learn?
        </label>
        <p className="text-xs text-stone-400">
          A durable takeaway from this investigation. Write it yourself — the
          system will not generate this for you.
        </p>
        <textarea
          id="statement"
          name="statement"
          required
          maxLength={5000}
          rows={3}
          autoFocus
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="What you now believe you learned from this investigation..."
        />
      </div>

      <div>
        <label
          htmlFor="basis"
          className="block text-sm font-medium text-stone-700"
        >
          Basis (optional)
        </label>
        <p className="text-xs text-stone-400">
          What is this learning based on?
        </p>
        <textarea
          id="basis"
          name="basis"
          maxLength={5000}
          rows={2}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="e.g. Result from Experiment 1 combined with Observation 2"
        />
      </div>

      <div>
        <label
          htmlFor="confidence"
          className="block text-sm font-medium text-stone-700"
        >
          Confidence (optional)
        </label>
        <select
          id="confidence"
          name="confidence"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        >
          <option value="">Select if applicable...</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
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
          {pending ? "Saving..." : "Save learning"}
        </Button>
      </div>
    </form>
  );
}
