"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface CaseEditFormProps {
  painCase: {
    id: string;
    title: string;
    description: string;
    status: string;
    importance: string;
    tags: string[];
  };
  onClose: () => void;
}

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ABANDONED", label: "Abandoned" },
];

const importanceOptions = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

export function CaseEditForm({ painCase, onClose }: CaseEditFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const tags = (formData.get("tags") as string)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/cases/${painCase.id}`, {
        method: "PATCH",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to update case");
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
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={painCase.title}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-stone-700"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          maxLength={2000}
          rows={4}
          defaultValue={painCase.description}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
      </div>

      <div>
        <label
          htmlFor="status"
          className="block text-sm font-medium text-stone-700"
        >
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={painCase.status}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="importance"
          className="block text-sm font-medium text-stone-700"
        >
          Importance
        </label>
        <select
          id="importance"
          name="importance"
          defaultValue={painCase.importance}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        >
          {importanceOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="tags"
          className="block text-sm font-medium text-stone-700"
        >
          Tags
        </label>
        <p className="text-xs text-stone-400">Comma-separated</p>
        <input
          id="tags"
          name="tags"
          type="text"
          defaultValue={painCase.tags.join(", ")}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="e.g. hackathons, validation, ideas"
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
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
