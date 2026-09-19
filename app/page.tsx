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
  const identity = await getChatGPTUser();
  if (!identity) {
    return <LearnerJourney learnerId={getActiveLearnerId()} />;
  }

  const learnerId = await getActiveLearnerId(
    identity,
    findLearnerIdByExternalUserId,
  );

  return learnerId ? <LearnerJourney learnerId={learnerId} /> : null;
}
