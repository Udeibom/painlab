"use client";

import { useState } from "react";
import { HackathonBriefForm } from "./HackathonBriefForm";

export function HackathonInvestigateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100"
      >
        Investigate a hackathon
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-2xl rounded-lg border border-stone-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto mx-4">
            <h2 className="mb-1 text-lg font-semibold">Hackathon investigation</h2>
            <p className="mb-4 text-sm text-stone-500">
              PainLab will search for real needs of your target community, profile the judges, generate
              candidate solutions, and run each through a kill cycle. Takes 2–5 minutes.
            </p>
            <HackathonBriefForm onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
