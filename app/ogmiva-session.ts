import { headers } from "next/headers";
import { getRequestExecutionContext } from "vinext/shims/request-context";

const SESSION_COOKIE_NAME = "ogmiva_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

type D1OgmivaSessionDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
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

  const storedSessionId = await hashSessionToken(sessionId);

  const session = await getOgmivaSessionDatabase()
    .prepare(`
      SELECT learner_id AS learnerId
      FROM learner_sessions
      WHERE session_id = ?
        AND expires_at > CURRENT_TIMESTAMP
    `)
    .bind(storedSessionId)
    .first<{ learnerId: string }>();

  return session?.learnerId ?? null;
}

export async function createOgmivaSession(learnerId: string) {
  const token = createSessionToken();
  const storedSessionId = await hashSessionToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_SECONDS * 1000,
  ).toISOString();

  await getOgmivaSessionDatabase()
    .prepare(`
      INSERT INTO learner_sessions (
        session_id,
        learner_id,
        expires_at
      ) VALUES (?, ?, ?)
    `)
    .bind(storedSessionId, learnerId, expiresAt)
    .run();

  return { token, expiresAt, maxAge: SESSION_DURATION_SECONDS };
}

export async function createOgmivaSessionResponse(
  learnerId: string,
): Promise<Response> {
  const session = await createOgmivaSession(learnerId);
  const cookie = [
    `${SESSION_COOKIE_NAME}=${session.token}`,
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

function getOgmivaSessionDatabase(): D1OgmivaSessionDatabase {
  const requestContext = getRequestExecutionContext() as
    | OgmivaSessionRequestContext
    | null;
  if (!requestContext?.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return requestContext.DB;
}

function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
