import { getActiveLearnerId } from "./learner-identity";
import { LearnerJourney } from "./learner-journey";

export default function Home() {
  return <LearnerJourney learnerId={getActiveLearnerId()} />;
}
