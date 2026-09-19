type ExternalIdentity = { userId: string };
type LearnerIdLookup = (
  externalUserId: string,
) => Promise<string | null>;

export function getActiveLearnerId(): string;
export function getActiveLearnerId(
  identityOrSource:
    | ExternalIdentity
    | (() => Promise<ExternalIdentity | null>),
  findLearnerIdByExternalUserId: LearnerIdLookup,
): Promise<string | null>;
export function getActiveLearnerId(
  identityOrSource?:
    | ExternalIdentity
    | (() => Promise<ExternalIdentity | null>),
  findLearnerIdByExternalUserId?: LearnerIdLookup,
): string | Promise<string | null> {
  if (!identityOrSource || !findLearnerIdByExternalUserId) return "learner-1";

  if (typeof identityOrSource === "function") {
    return identityOrSource().then((identity) =>
      identity
        ? resolveLearnerId(identity, findLearnerIdByExternalUserId)
        : null,
    );
  }

  return resolveLearnerId(identityOrSource, findLearnerIdByExternalUserId);
}

export async function resolveLearnerId(
  identity: ExternalIdentity,
  findLearnerIdByExternalUserId: LearnerIdLookup,
): Promise<string | null> {
  return findLearnerIdByExternalUserId(identity.userId);
}
