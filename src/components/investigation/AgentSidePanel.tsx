"use client";

import { AgentProgressPanel } from "./AgentProgressPanel";

interface AgentSidePanelProps {
  agentRunId: string;
}

// Client wrapper so the server page doesn't have to pass a function prop.
// onComplete reloads the page so the server re-fetches the case and shows
// the Current State panel instead of the Agent Progress panel.
export function AgentSidePanel({ agentRunId }: AgentSidePanelProps) {
  function handleComplete() {
    window.location.reload();
  }

  return (
    <AgentProgressPanel agentRunId={agentRunId} onComplete={handleComplete} />
  );
}
