import { getChatGPTUser } from "../../chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "../../configured-learner-identity";
import { getActiveLearnerId } from "../../learner-identity";
import { saveD1LearnerProgress } from "../../learner-progress-d1";
import type { StoredLearnerProgress } from "../../local-progress";

export async function POST(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return new Response(null, { status: 401 });

  const learnerId = await getActiveLearnerId(
    identity,
    findConfiguredLearnerIdByExternalUserId,
  );
  if (!learnerId) return new Response(null, { status: 403 });

  const submittedProgress = await request.json() as StoredLearnerProgress;
  const snapshot: StoredLearnerProgress = {
    learnerId,
    completedActivityIds: submittedProgress.completedActivityIds,
    ...(submittedProgress.completedListeningActivityIds ? {
      completedListeningActivityIds:
        submittedProgress.completedListeningActivityIds,
    } : {}),
    ...(submittedProgress.progressRecords ? {
      progressRecords: submittedProgress.progressRecords.map((record) => ({
        ...record,
        learnerId,
      })),
    } : {}),
  };

  await saveD1LearnerProgress(snapshot);

  return new Response(null, { status: 204 });
}
