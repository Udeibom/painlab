"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface HypothesisFormProps {
  painCaseId: string;
  onClose: () => void;
}

export function HypothesisForm({ painCaseId, onClose }: HypothesisFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("painCaseId", painCaseId);

    try {
      const res = await fetch("/api/hypotheses", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save hypothesis");
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
          What do you suspect might explain this?
        </label>
        <p className="text-xs text-stone-400">
          Write it as a hypothesis, not a fact. The status defaults to
          &quot;Proposed&quot; — it will not be treated as a conclusion.
        </p>
        <textarea
          id="statement"
          name="statement"
          required
          maxLength={5000}
          rows={3}
          autoFocus
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="State what you think might be going on..."
        />
      </div>

      <div>
        <label
          htmlFor="rationale"
          className="block text-sm font-medium text-stone-700"
        >
          Rationale (optional)
        </label>
        <p className="text-xs text-stone-400">
          Why do you suspect this? What makes you think it?
        </p>
        <textarea
          id="rationale"
          name="rationale"
          maxLength={5000}
          rows={2}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="What reasoning or observations led you to this hypothesis?"
        />
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
        <p className="text-xs text-amber-800">
          <span className="font-medium">Status: Proposed</span> — this
          hypothesis starts as uncertain. You control when and how its status
          changes. Recording a result will not change it for you.
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
          {pending ? "Saving..." : "Save hypothesis"}
        </Button>
      </div>
    </form>
  );
}
