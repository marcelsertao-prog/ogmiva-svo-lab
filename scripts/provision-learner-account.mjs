import { createPbkdf2CredentialVerifier } from "../app/learner-credential.ts";

export async function provisionLearnerAccount({
  database,
  loginId,
  learnerId,
  credential,
}) {
  const credentialVerifier = await createPbkdf2CredentialVerifier(credential);

  await database.prepare(`
    INSERT INTO learner_accounts (
      login_id,
      learner_id,
      credential_hash
    ) VALUES (?, ?, ?)
  `).bind(loginId, learnerId, credentialVerifier).run();
}
