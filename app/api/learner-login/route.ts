import { authenticateProvisionedLearner } from "../../learner-account";
import { createOgmivaSessionResponse } from "../../ogmiva-session";

type LearnerLoginRequest = {
  loginId?: unknown;
  credential?: unknown;
};

export async function POST(request: Request) {
  let body: LearnerLoginRequest;
  try {
    body = await request.json() as LearnerLoginRequest;
  } catch {
    return new Response(null, { status: 400 });
  }

  if (
    typeof body.loginId !== "string"
    || body.loginId.length === 0
    || typeof body.credential !== "string"
    || body.credential.length === 0
  ) {
    return new Response(null, { status: 400 });
  }

  const learnerId = await authenticateProvisionedLearner(
    body.loginId,
    body.credential,
  );
  if (!learnerId) return new Response(null, { status: 401 });

  return createOgmivaSessionResponse(learnerId);
}
