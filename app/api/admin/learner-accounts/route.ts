import { getRequestExecutionContext } from "vinext/shims/request-context";

import {
  provisionLearnerAccount,
  type D1LearnerAccountDatabase,
} from "../../../learner-account";

type LearnerAccountProvisioningEnvironment = {
  DB: D1LearnerAccountDatabase;
  OGMIVA_PROVISIONING_SECRET?: string;
};

type LearnerAccountProvisioningRequest = {
  loginId: string;
  learnerId: string;
  credential: string;
};

export async function POST(request: Request) {
  const requestContext = getRequestExecutionContext() as
    | LearnerAccountProvisioningEnvironment
    | null;
  const provisioningSecret = requestContext?.OGMIVA_PROVISIONING_SECRET;
  const authorization = request.headers.get("authorization");

  if (
    !provisioningSecret
    || authorization !== `Bearer ${provisioningSecret}`
  ) {
    return new Response(null, { status: 401 });
  }

  const body = await request.json() as LearnerAccountProvisioningRequest;
  await provisionLearnerAccount({
    database: requestContext.DB,
    loginId: body.loginId,
    learnerId: body.learnerId,
    credential: body.credential,
  });

  return new Response(null, { status: 204 });
}
