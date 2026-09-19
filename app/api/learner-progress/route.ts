import { getChatGPTUser } from "../../chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "../../configured-learner-identity";
import { getActiveLearnerId } from "../../learner-identity";
import { saveD1LearnerProgress } from "../../learner-progress-d1";
import type { StoredLearnerProgress } from "../../local-progress";
import { getOgmivaSessionLearnerId } from "../../ogmiva-session";

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
