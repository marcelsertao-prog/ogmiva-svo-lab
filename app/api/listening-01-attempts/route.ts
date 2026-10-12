import { AssessmentEngine } from "@seal-sdk/assessment";
import { EvidenceEngine } from "@seal-sdk/evidence";
import { createSubmitAnswerInteraction } from "@seal-sdk/interaction";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { getChatGPTUser } from "../../chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "../../configured-learner-identity";
import { getActiveLearnerId } from "../../learner-identity";
import { listening01Activity } from "../../listening-01";
import { getOgmivaSessionLearnerId } from "../../ogmiva-session";

type D1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
};

export async function POST(request: Request) {
  let learnerId = await getOgmivaSessionLearnerId();
  if (!learnerId) {
    const identity = await getChatGPTUser();
    if (!identity) return new Response(null, { status: 401 });
    learnerId = await getActiveLearnerId(
      identity,
      findConfiguredLearnerIdByExternalUserId,
    );
    if (!learnerId) return new Response(null, { status: 403 });
  }

  let submitted: unknown;
  try {
    submitted = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!submitted || typeof submitted !== "object") {
    return new Response(null, { status: 400 });
  }
  const { activityId, recordId, selectedAnswer } = submitted as Record<string, unknown>;
  if (
    activityId !== listening01Activity.id
    || typeof recordId !== "string"
    || recordId.length === 0
    || typeof selectedAnswer !== "string"
    || !listening01Activity.availableUnits.includes(selectedAnswer)
  ) {
    return new Response(null, { status: 400 });
  }

  const interaction = createSubmitAnswerInteraction({
    sessionId: crypto.randomUUID(),
    learnerId,
    submittedUnits: [selectedAnswer],
  });
  const evidence = new EvidenceEngine().capture(interaction);
  const assessment = new AssessmentEngine().assess({
    evidence,
    expectedUnits: listening01Activity.expectedUnits,
  });

  const context = getRequestExecutionContext() as { DB?: D1Database } | null;
  if (!context?.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  await context.DB.prepare(`
    INSERT INTO verified_listening01_attempts (
      learner_id, record_id, activity_id, selected_answer, score, completed
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    learnerId,
    recordId,
    listening01Activity.id,
    selectedAnswer,
    assessment.score,
    assessment.correct ? 1 : 0,
  ).run();

  return new Response(null, { status: 201 });
}
