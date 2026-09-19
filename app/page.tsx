import { requireChatGPTUser } from "./chatgpt-auth";
import {
  createConfiguredLearnerIdLookup,
  getActiveLearnerId,
} from "./learner-identity";
import { LearnerJourney } from "./learner-journey";
import {
  loadD1LearnerProgress,
} from "./learner-progress-d1";

const findLearnerIdByExternalUserId = createConfiguredLearnerIdLookup({
  externalUserId: "external-user-2",
  learnerId: "learner-2",
});

export default async function Home() {
  const identity = await requireChatGPTUser("/");
  const learnerId = await getActiveLearnerId(
    identity,
    findLearnerIdByExternalUserId,
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
