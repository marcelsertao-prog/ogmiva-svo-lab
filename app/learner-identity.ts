export function getActiveLearnerId(): string;
export function getActiveLearnerId(
  identity: { userId: string },
  findLearnerIdByExternalUserId: (
    externalUserId: string,
  ) => Promise<string | null>,
): Promise<string | null>;
export function getActiveLearnerId(
  identity?: { userId: string },
  findLearnerIdByExternalUserId?: (
    externalUserId: string,
  ) => Promise<string | null>,
): string | Promise<string | null> {
  if (!identity || !findLearnerIdByExternalUserId) return "learner-1";

  return resolveLearnerId(identity, findLearnerIdByExternalUserId);
}

export async function resolveLearnerId(
  identity: { userId: string },
  findLearnerIdByExternalUserId: (
    externalUserId: string,
  ) => Promise<string | null>,
): Promise<string | null> {
  return findLearnerIdByExternalUserId(identity.userId);
}
