"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface ObservationFormProps {
  painCaseId: string;
  onClose: () => void;
}

export function ObservationForm({ painCaseId, onClose }: ObservationFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("painCaseId", painCaseId);

    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save observation");
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
          htmlFor="content"
          className="block text-sm font-medium text-stone-700"
        >
          What did you observe?
        </label>
        <p className="text-xs text-stone-400">
          Something you directly noticed or experienced — not an interpretation.
        </p>
        <textarea
          id="content"
          name="content"
          required
          maxLength={5000}
          rows={4}
          autoFocus
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="Describe what you directly observed or experienced..."
        />
      </div>

      <div>
        <label
          htmlFor="observedAt"
          className="block text-sm font-medium text-stone-700"
        >
          When did this happen?
        </label>
        <input
          id="observedAt"
          name="observedAt"
          type="datetime-local"
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
      </div>

      <div>
        <label
          htmlFor="context"
          className="block text-sm font-medium text-stone-700"
        >
          Context (optional)
        </label>
        <p className="text-xs text-stone-400">
          What was happening around this observation?
        </p>
        <textarea
          id="context"
          name="context"
          maxLength={2000}
          rows={2}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="What were you doing, what else was going on?"
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
          {pending ? "Saving..." : "Save observation"}
        </Button>
      </div>
    </form>
  );
}
