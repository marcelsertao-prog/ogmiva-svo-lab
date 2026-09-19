import { requireChatGPTUser } from "./chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "./configured-learner-identity";
import { getActiveLearnerId } from "./learner-identity";
import { LearnerJourney } from "./learner-journey";
import {
  loadD1LearnerProgress,
} from "./learner-progress-d1";
import { getOgmivaSessionLearnerId } from "./ogmiva-session";

export default async function Home() {
  const sessionLearnerId = await getOgmivaSessionLearnerId();
  const learnerId = sessionLearnerId ?? await resolveChatGPTLearnerId();

  if (!learnerId) return null;

  const initialProgress = await loadD1LearnerProgress(learnerId);

  return (
    <LearnerJourney
      learnerId={learnerId}
      initialProgress={initialProgress}
    />
  );
}

async function resolveChatGPTLearnerId() {
  const identity = await requireChatGPTUser("/");

  return getActiveLearnerId(
    identity,
    findConfiguredLearnerIdByExternalUserId,
  );
}
