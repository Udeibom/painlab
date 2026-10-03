"use client";

import { useState } from "react";

interface HypothesisStatusEditorProps {
  hypothesisId: string;
  painCaseId: string;
  currentStatus: string;
}

const statusOptions = [
  { value: "PROPOSED", label: "Proposed" },
  { value: "SUPPORTED", label: "Supported" },
  { value: "PARTIALLY_SUPPORTED", label: "Partially Supported" },
  { value: "CONTRADICTED", label: "Contradicted" },
  { value: "UNRESOLVED", label: "Unresolved" },
  { value: "INSUFFICIENT_EVIDENCE", label: "Insufficient Evidence" },
];

const statusColors: Record<string, string> = {
  PROPOSED: "bg-amber-100 text-amber-800",
  SUPPORTED: "bg-green-100 text-green-800",
  PARTIALLY_SUPPORTED: "bg-blue-100 text-blue-800",
  CONTRADICTED: "bg-red-100 text-red-800",
  UNRESOLVED: "bg-yellow-100 text-yellow-800",
  INSUFFICIENT_EVIDENCE: "bg-gray-100 text-gray-600",
};

export function HypothesisStatusEditor({
  hypothesisId,
  painCaseId,
  currentStatus,
}: HypothesisStatusEditorProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(currentStatus);

  async function updateStatus(newStatus: string) {
    if (newStatus === status) {
      setOpen(false);
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/hypotheses/${hypothesisId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, painCaseId }),
      });
      if (!res.ok) {
        const body = await res.json();
        console.error("Failed to update status:", body.error);
        setPending(false);
        return;
      }
      setStatus(newStatus);
      setOpen(false);
      setPending(false);
      window.location.reload();
    } catch {
      setPending(false);
    }
  }

  const currentLabel =
    statusOptions.find((s) => s.value === status)?.label ?? status;
  const currentColor = statusColors[status] ?? "bg-stone-100 text-stone-700";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${currentColor} hover:opacity-80 disabled:opacity-50`}
        title="Click to change status"
      >
        {currentLabel}
        <span className="text-[10px]">▾</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute z-50 mt-1 w-48 rounded-md border border-stone-200 bg-white py-1 shadow-lg">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateStatus(option.value)}
                disabled={pending}
                className={`flex w-full items-center px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50 ${
                  option.value === status
                    ? "font-medium text-stone-900"
                    : "text-stone-600"
                }`}
              >
                {option.value === status && (
                  <span className="mr-1.5 text-xs">✓</span>
                )}
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
