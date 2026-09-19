import { getRequestExecutionContext } from "vinext/shims/request-context";

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

async function verifyPbkdf2Credential(
  credential: string,
  verifier: string,
): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedHashText, ...rest] =
    verifier.split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== "pbkdf2-sha256"
    || !Number.isSafeInteger(iterations)
    || iterations < 1
    || !saltText
    || !expectedHashText
    || rest.length > 0
  ) {
    return false;
  }

  const salt = decodeBase64Url(saltText);
  const expectedHash = decodeBase64Url(expectedHashText);
  if (!salt || !expectedHash || expectedHash.length === 0) return false;

  const credentialKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(credential),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const actualHash = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations,
  }, credentialKey, expectedHash.length * 8));

  return equalBytes(actualHash, expectedHash);
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(base64 + padding);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ (right[index] ?? 0);
  }

  return difference === 0;
}
