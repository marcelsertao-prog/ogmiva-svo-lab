import { authenticateProvisionedLearner } from "../../learner-account";
import { createOgmivaSessionResponse } from "../../ogmiva-session";

type LearnerLoginRequest = {
  loginId?: unknown;
  credential?: unknown;
};

export async function POST(request: Request) {
  const isFormSubmission = request.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/x-www-form-urlencoded";
  let body: LearnerLoginRequest;
  try {
    if (isFormSubmission) {
      const formData = await request.formData();
      body = {
        loginId: formData.get("loginId"),
        credential: formData.get("credential"),
      };
    } else {
      body = await request.json() as LearnerLoginRequest;
    }
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
  if (!learnerId) {
    return isFormSubmission
      ? new Response(null, {
        status: 303,
        headers: { location: "/?login=failed" },
      })
      : new Response(null, { status: 401 });
  }

  const response = await createOgmivaSessionResponse(learnerId);
  if (!isFormSubmission) return response;

  const headers = new Headers(response.headers);
  headers.set("location", "/");

  return new Response(null, { status: 303, headers });
}
