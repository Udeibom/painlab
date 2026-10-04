"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface HackathonBriefFormProps {
  onClose: () => void;
}

export function HackathonBriefForm({ onClose }: HackathonBriefFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/agent-runs", {
        method: "POST",
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to start investigation");
        setPending(false);
        return;
      }
      // Redirect to the case page — the agent is already running in the background
      window.location.href = `/cases/${body.painCaseId}`;
    } catch {
      setError("Something went wrong. Check your network connection.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="hackathonName" className="block text-sm font-medium text-stone-700">
          Hackathon name
        </label>
        <input
          id="hackathonName"
          name="hackathonName"
          type="text"
          required
          maxLength={200}
          autoFocus
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="e.g. Build With AI: Basics 2026"
        />
      </div>

      <div>
        <label htmlFor="targetCommunity" className="block text-sm font-medium text-stone-700">
          Who do you want to build for?
        </label>
        <p className="text-xs text-stone-400">
          Be specific. &quot;People&quot; is too broad. &quot;Out-of-school children in Kano&quot; is useful.
        </p>
        <input
          id="targetCommunity"
          name="targetCommunity"
          type="text"
          required
          maxLength={300}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="e.g. Almajiri youth in northern Nigeria"
        />
      </div>

      <div>
        <label htmlFor="hackathonBrief" className="block text-sm font-medium text-stone-700">
          Hackathon overview
        </label>
        <p className="text-xs text-stone-400">
          Paste the full brief — theme, requirements, judging criteria, anything that matters.
        </p>
        <textarea
          id="hackathonBrief"
          name="hackathonBrief"
          required
          minLength={20}
          maxLength={5000}
          rows={6}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="Paste the hackathon description, theme, and judging criteria here..."
        />
      </div>

      <div>
        <label htmlFor="judges" className="block text-sm font-medium text-stone-700">
          Judge names
        </label>
        <p className="text-xs text-stone-400">
          Comma-separated. The agent will search their public posts to infer what they value.
        </p>
        <input
          id="judges"
          name="judges"
          type="text"
          required
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="e.g. Darlyze Calixte, Joe Holmes, Michelle Brain"
        />
      </div>

      <div>
        <label htmlFor="resources" className="block text-sm font-medium text-stone-700">
          Resources / APIs provided (optional)
        </label>
        <input
          id="resources"
          name="resources"
          type="text"
          maxLength={2000}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="e.g. Cloudflare Workers free tier, any LLM API"
        />
      </div>

      <div>
        <label htmlFor="constraints" className="block text-sm font-medium text-stone-700">
          Your constraints (optional)
        </label>
        <input
          id="constraints"
          name="constraints"
          type="text"
          maxLength={1000}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          placeholder="e.g. solo developer, must be deployable, 48 hours"
        />
      </div>

      <div className="rounded-md bg-stone-50 border border-stone-200 px-3 py-2">
        <p className="text-xs text-stone-600">
          <span className="font-medium">What happens next:</span> PainLab will search the web for
          real unmet needs of your target community, profile the judges from their public posts,
          generate candidate solutions, and run each through a kill cycle. This takes 2–5 minutes.
          All findings land in a Pain Case as typed, labeled evidence — not a verdict.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Starting investigation..." : "Start hackathon investigation"}
        </Button>
      </div>
    </form>
  );
}
