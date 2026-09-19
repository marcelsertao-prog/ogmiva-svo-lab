import { getChatGPTUser } from "../../chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "../../configured-learner-identity";
import { getActiveLearnerId } from "../../learner-identity";
import { createOgmivaSession } from "../../ogmiva-session";

export async function POST() {
  const identity = await getChatGPTUser();
  if (!identity) return new Response(null, { status: 401 });

  const learnerId = await getActiveLearnerId(
    identity,
    findConfiguredLearnerIdByExternalUserId,
  );
  if (!learnerId) return new Response(null, { status: 403 });

  const session = await createOgmivaSession(learnerId);
  const cookie = [
    `ogmiva_session=${session.token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${session.maxAge}`,
    `Expires=${new Date(session.expiresAt).toUTCString()}`,
  ].join("; ");

  return new Response(null, {
    status: 204,
    headers: { "set-cookie": cookie },
  });
}
