import { requireChatGPTUser } from "./chatgpt-auth";
import {
  createConfiguredLearnerIdLookup,
  getActiveLearnerId,
} from "./learner-identity";
import { LearnerJourney } from "./learner-journey";

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

  return learnerId ? <LearnerJourney learnerId={learnerId} /> : null;
}
