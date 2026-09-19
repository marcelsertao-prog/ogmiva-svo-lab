import { getRequestExecutionContext } from "vinext/shims/request-context";

import { verifyPbkdf2Credential } from "./learner-credential";

type D1LearnerAccountDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
    };
  };
};

type LearnerAccountRequestContext = {
  DB: D1LearnerAccountDatabase;
};

type ProvisionedLearnerAccount = {
  learnerId: string;
  credentialVerifier: string;
};

export async function authenticateProvisionedLearner(
  loginId: string,
  credential: string,
): Promise<string | null> {
  const account = await getLearnerAccountDatabase()
    .prepare(`
      SELECT
        learner_id AS learnerId,
        credential_hash AS credentialVerifier
      FROM learner_accounts
      WHERE login_id = ?
    `)
    .bind(loginId)
    .first<ProvisionedLearnerAccount>();

  if (!account) return null;

  const isValid = await verifyPbkdf2Credential(
    credential,
    account.credentialVerifier,
  );

  return isValid ? account.learnerId : null;
}

function getLearnerAccountDatabase(): D1LearnerAccountDatabase {
  const requestContext = getRequestExecutionContext() as
    | LearnerAccountRequestContext
    | null;
  if (!requestContext?.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return requestContext.DB;
}
