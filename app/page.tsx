import { getChatGPTUser } from "./chatgpt-auth";
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
  const learnerId = await getActiveLearnerId(
    getChatGPTUser,
    findLearnerIdByExternalUserId,
  );

  return <LearnerJourney learnerId={learnerId ?? getActiveLearnerId()} />;
}
