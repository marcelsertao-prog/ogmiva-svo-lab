import { requireChatGPTUser } from "./chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "./configured-learner-identity";
import { getActiveLearnerId } from "./learner-identity";
import { LearnerJourney } from "./learner-journey";
import {
  loadD1LearnerProgress,
} from "./learner-progress-d1";

export default async function Home() {
  const identity = await requireChatGPTUser("/");
  const learnerId = await getActiveLearnerId(
    identity,
    findConfiguredLearnerIdByExternalUserId,
  );

  if (!learnerId) return null;

  const initialProgress = await loadD1LearnerProgress(learnerId);

  return (
    <LearnerJourney
      learnerId={learnerId}
      initialProgress={initialProgress}
    />
  );
}
