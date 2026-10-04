/**
 * POST /api/agent-runs
 *
 * Creates a PainCase + HackathonContext, creates an AgentRun,
 * fires the agent in the background (no await), returns { agentRunId, painCaseId }
 * immediately so the UI can redirect and start polling.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHackathonContextSchema } from "@/server/validation/hackathonContext";
import { createPainCase } from "@/server/services/painCaseService";
import { createHackathonContext } from "@/server/services/hackathonContextService";
import { createAgentRun } from "@/server/services/agentRunService";
import { runHackathonAgent } from "@/server/agents/hackathonAgent";
import { GroqAiProvider } from "@/server/providers/ai/groqProvider";
import { TavilyResearchProvider } from "@/server/providers/research/tavilyProvider";

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const raw = {
    hackathonName: formData.get("hackathonName") as string,
    hackathonBrief: formData.get("hackathonBrief") as string,
    resources: (formData.get("resources") as string) || undefined,
    judges: formData.get("judges") as string,
    targetCommunity: formData.get("targetCommunity") as string,
    constraints: (formData.get("constraints") as string) || undefined,
  };

  const parsed = createHackathonContextSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // 1. Create the Pain Case (title will be overwritten by agent Phase 1)
  const painCase = await createPainCase({
    title: `Investigating: ${data.hackathonName} — ${data.targetCommunity}`,
    description: data.hackathonBrief.slice(0, 500),
    importance: "HIGH",
  });

  // 2. Create the HackathonContext
  const context = await createHackathonContext(painCase.id, {
    hackathonName: data.hackathonName,
    hackathonBrief: data.hackathonBrief,
    resources: data.resources,
    judges: data.judges as unknown as string[], // already transformed by Zod
    targetCommunity: data.targetCommunity,
    constraints: data.constraints,
  });

  // 3. Create the AgentRun record
  const agentRun = await createAgentRun(context.id);

  // 4. Fire the agent WITHOUT awaiting — returns immediately.
  //    The agent writes progress to AgentStep rows; the UI polls for them.
  const ai = new GroqAiProvider();
  const research = new TavilyResearchProvider();

  // Intentionally not awaited — runs in background
  void runHackathonAgent(agentRun.id, context, ai, research).catch((err) => {
    console.error("[POST /api/agent-runs] background agent error:", err);
  });

  return NextResponse.json(
    { agentRunId: agentRun.id, painCaseId: painCase.id },
    { status: 201 },
  );
}
