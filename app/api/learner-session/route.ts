import { getChatGPTUser } from "../../chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "../../configured-learner-identity";
import { getActiveLearnerId } from "../../learner-identity";
import { createOgmivaSessionResponse } from "../../ogmiva-session";

export async function POST() {
  const identity = await getChatGPTUser();
  if (!identity) return new Response(null, { status: 401 });

  const learnerId = await getActiveLearnerId(
    identity,
    findConfiguredLearnerIdByExternalUserId,
  );
  if (!learnerId) return new Response(null, { status: 403 });

  return createOgmivaSessionResponse(learnerId);
}
