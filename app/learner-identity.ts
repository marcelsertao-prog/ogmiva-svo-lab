export function getActiveLearnerId(): string {
  return "learner-1";
}

export async function resolveLearnerId(
  identity: { userId: string },
  findLearnerIdByExternalUserId: (
    externalUserId: string,
  ) => Promise<string | null>,
): Promise<string | null> {
  return findLearnerIdByExternalUserId(identity.userId);
}
