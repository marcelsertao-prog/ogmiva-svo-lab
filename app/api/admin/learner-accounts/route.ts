import { getRequestExecutionContext } from "vinext/shims/request-context";

import {
  deprovisionLearnerAccount,
  provisionLearnerAccount,
  type D1LearnerAccountDatabase,
} from "../../../learner-account";

type LearnerAccountProvisioningEnvironment = {
  DB: D1LearnerAccountDatabase;
  OGMIVA_PROVISIONING_SECRET?: string;
};

type LearnerAccountProvisioningRequest = {
  loginId?: unknown;
  learnerId?: unknown;
  credential?: unknown;
};

type LearnerAccountDeprovisioningRequest = {
  loginId: string;
};

function getAuthorizedAdministrativeEnvironment(
  request: Request,
): LearnerAccountProvisioningEnvironment | null {
  const requestContext = getRequestExecutionContext() as
    | LearnerAccountProvisioningEnvironment
    | null;
  const provisioningSecret = requestContext?.OGMIVA_PROVISIONING_SECRET;
  const authorization = request.headers.get("authorization");

  if (
    !provisioningSecret
    || authorization !== `Bearer ${provisioningSecret}`
  ) {
    return null;
  }

  return requestContext;
}

export async function POST(request: Request) {
  const requestContext = getAuthorizedAdministrativeEnvironment(request);
  if (!requestContext) {
    return new Response(null, { status: 401 });
  }

  let body: LearnerAccountProvisioningRequest;
  try {
    body = await request.json() as LearnerAccountProvisioningRequest;
  } catch {
    return new Response(null, { status: 400 });
  }

  if (
    typeof body.loginId !== "string"
    || body.loginId.length === 0
    || typeof body.learnerId !== "string"
    || body.learnerId.length === 0
    || typeof body.credential !== "string"
    || body.credential.length === 0
  ) {
    return new Response(null, { status: 400 });
  }

  try {
    await provisionLearnerAccount({
      database: requestContext.DB,
      loginId: body.loginId,
      learnerId: body.learnerId,
      credential: body.credential,
    });
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes(
        "UNIQUE constraint failed: learner_accounts.login_id",
      )
    ) {
      return new Response(null, { status: 409 });
    }

    throw error;
  }

  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const requestContext = getAuthorizedAdministrativeEnvironment(request);
  if (!requestContext) {
    return new Response(null, { status: 401 });
  }

  const body = await request.json() as LearnerAccountDeprovisioningRequest;
  await deprovisionLearnerAccount({
    database: requestContext.DB,
    loginId: body.loginId,
  });

  return new Response(null, { status: 204 });
}
