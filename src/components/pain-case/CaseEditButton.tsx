"use client";

import { useState } from "react";
import { CaseEditForm } from "./CaseEditForm";

interface CaseEditButtonProps {
  painCase: {
    id: string;
    title: string;
    description: string;
    status: string;
    importance: string;
    tags: string[];
  };
}

export function CaseEditButton({ painCase }: CaseEditButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
      >
        Edit
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg border border-stone-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-lg font-semibold">Edit Pain Case</h2>
            <CaseEditForm
              painCase={painCase}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
