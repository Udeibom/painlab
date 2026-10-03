"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface CreateCaseFormProps {
  onCreated?: () => void;
}

export function CreateCaseForm({ onCreated }: CreateCaseFormProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create case");
        setPending(false);
        return;
      }
      const { id } = await res.json();
      window.location.href = `/cases/${id}`;
    } catch {
      setError("Something went wrong");
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Start investigating a pain</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg border border-stone-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">New Pain Case</h2>
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
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
                  placeholder="What pain or problem are you investigating?"
                />
              </div>
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-stone-700"
                >
                  Describe the pain
                </label>
                <textarea
                  id="description"
                  name="description"
                  required
                  maxLength={2000}
                  rows={4}
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
                  placeholder="In your own words: what's happening, when does it occur, why does it matter?"
                />
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
                  defaultValue="MEDIUM"
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating..." : "Start investigating"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
