import { headers } from "next/headers";
import { getRequestExecutionContext } from "vinext/shims/request-context";

const SESSION_COOKIE_NAME = "ogmiva_session";

type D1OgmivaSessionDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
    };
  };
};

type OgmivaSessionRequestContext = {
  DB: D1OgmivaSessionDatabase;
};

export async function getOgmivaSessionLearnerId(): Promise<string | null> {
  const requestHeaders = await headers();
  const sessionId = readCookie(
    requestHeaders.get("cookie"),
    SESSION_COOKIE_NAME,
  );
  if (!sessionId) return null;

  const requestContext = getRequestExecutionContext() as
    | OgmivaSessionRequestContext
    | null;
  if (!requestContext?.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  const session = await requestContext.DB
    .prepare(`
      SELECT learner_id AS learnerId
      FROM learner_sessions
      WHERE session_id = ?
        AND expires_at > CURRENT_TIMESTAMP
    `)
    .bind(sessionId)
    .first<{ learnerId: string }>();

  return session?.learnerId ?? null;
}

function readCookie(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) continue;

    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName !== name) continue;

    const value = cookie.slice(separatorIndex + 1).trim();
    return value || null;
  }

  return null;
}
