import { createConfiguredLearnerIdLookup } from "./learner-identity";

export const findConfiguredLearnerIdByExternalUserId =
  createConfiguredLearnerIdLookup({
    externalUserId: "external-user-2",
    learnerId: "learner-2",
  });
