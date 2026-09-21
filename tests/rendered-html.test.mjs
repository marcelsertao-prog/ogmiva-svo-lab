import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { Miniflare } from "miniflare";

import { ActivityEngine } from "@seal-sdk/activity";
import { AssessmentEngine } from "@seal-sdk/assessment";
import { EventBus } from "@seal-sdk/events";
import { EvidenceEngine } from "@seal-sdk/evidence";
import { DefaultProgressEngine } from "@seal-sdk/progress";
import { DefaultSessionEngine } from "@seal-sdk/session";
import {
  checkListening01Answer,
  listening01Activity,
} from "../app/listening-01.ts";
import { submitSpeaking01Attempt } from "../app/speaking-01.ts";
import {
  createConfiguredLearnerIdLookup,
  getActiveLearnerId,
  resolveLearnerId,
} from "../app/learner-identity.ts";
import { provisionLearnerAccount } from "../app/learner-account.ts";
import {
  createPbkdf2CredentialVerifier,
  verifyPbkdf2Credential,
} from "../app/learner-credential.ts";
import {
  canUnlockListening01,
  canUnlockListening02,
  canUnlockListening03,
  canUnlockListening04,
  canUnlockListening05,
  canUnlockSvo02,
  canUnlockSvo03,
  canUnlockSvo04,
  canUnlockSvo05,
  completeListening01Progress,
  completeListening02Progress,
  completeListening03Progress,
  completeListening04Progress,
  completeListening05Progress,
  createLocalLearnerProgressPersistence,
  loadLearnerProgress,
  persistLearnerProgress,
  resetListening01Attempt,
  resetListening02Attempt,
  resetListening03Attempt,
  resetListening04Attempt,
  resetListening05Attempt,
  restoreLearnerProgress,
} from "../app/local-progress.ts";
import {
  addListening02Tile,
  checkListening02Answer,
  listening02InitialTiles,
  startListening02Session,
} from "../app/listening-02.ts";
import {
  addListening03Tile,
  checkListening03Answer,
  listening03Activity,
  listening03InitialTiles,
  startListening03Session,
} from "../app/listening-03.ts";
import {
  checkListening04Answer,
  listening04Activity,
  listening04InitialTiles,
  serializeListening04Slots,
  startListening04Session,
} from "../app/listening-04.ts";
import {
  checkListening05Answer,
  listening05Activity,
  listening05InitialTiles,
  listening05Prompt,
  restartListening05,
  startListening05Session,
} from "../app/listening-05.ts";

async function importAppModuleWithLocalProgress(modulePath, moduleName) {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        specifier === "./local-progress"
        && context.parentURL?.includes(`/app/${moduleName}`)
      ) {
        return nextResolve("./local-progress.ts", context);
      }

      return nextResolve(specifier, context);
    },
  });

  try {
    return await import(modulePath);
  } finally {
    hooks.deregister();
  }
}

const { createD1LearnerProgressPersistence } =
  await importAppModuleWithLocalProgress(
    "../app/learner-progress-d1.ts",
    "learner-progress-d1.ts",
  );

async function persistProgressInMemory(
  storedProgress,
  nextProgress,
  {
    onSetItem = () => {},
  } = {},
) {
  let storedValue = storedProgress === undefined
    ? null
    : JSON.stringify(storedProgress);
  const persistence = createLocalLearnerProgressPersistence({
    getItem: () => storedValue,
    setItem: (key, value) => {
      onSetItem(key);
      storedValue = value;
    },
  });
  await persistLearnerProgress(persistence, nextProgress);

  return JSON.parse(storedValue);
}

async function createLearnerRestoreHarness(storedProgressByKey) {
  const completion = { isSvo02Complete: false };
  const restoredLearnerIds = [];
  const persistence = createLocalLearnerProgressPersistence({
    getItem: (key) => storedProgressByKey.get(key) ?? null,
    setItem: () => {},
  });
  const renderForLearner = async (learnerId) => {
    restoredLearnerIds.push(learnerId);
    try {
      const restoredProgress = await loadLearnerProgress(persistence, learnerId);
      const hasCompletedSvo01 = restoredProgress
        ?.completedActivityIds.includes("SVO-01") ?? false;
      completion.isSvo02Complete = hasCompletedSvo01
        && restoredProgress.completedActivityIds.includes("SVO-02");
    } catch {
      completion.isSvo02Complete = false;
    }
  };

  return { completion, renderForLearner, restoredLearnerIds };
}

async function fetchRenderedHome(headers = {}, bindings = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", ...headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      },
      ...bindings,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function applyD1Migrations(database) {
  const migrationFiles = (await readdir(
    new URL("../drizzle", import.meta.url),
  ))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  for (const migrationFile of migrationFiles) {
    const migration = await readFile(
      new URL(`../drizzle/${migrationFile}`, import.meta.url),
      "utf8",
    );
    await database.prepare(migration.trim()).run();
  }
}

async function createMigratedOgmivaHarness(
  t,
  databaseLabel,
  bindings = {},
) {
  const distServerPath = fileURLToPath(new URL("../dist/server", import.meta.url));
  const miniflare = new Miniflare({
    rootPath: distServerPath,
    modulesRoot: distServerPath,
    modules: true,
    modulesRules: [
      { type: "ESModule", include: ["**/*.js", "**/*.mjs"] },
    ],
    scriptPath: "index.js",
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    bindings,
    d1Databases: { DB: `${databaseLabel}-${process.pid}-${Date.now()}` },
  });
  t.after(() => miniflare.dispose());

  const database = await miniflare.getD1Database("DB");
  await applyD1Migrations(database);

  return { database, miniflare };
}

async function createAdministrativeProvisioningHarness(t, databaseLabel) {
  const provisioningSecret = "correct administrative secret";
  const { database, miniflare } = await createMigratedOgmivaHarness(
    t,
    `learner-admin-${databaseLabel}`,
    { OGMIVA_PROVISIONING_SECRET: provisioningSecret },
  );

  return { database, miniflare, provisioningSecret };
}

test("renders the initial SVO journey", async () => {
  const response = await fetchRenderedHome({
    "oai-authenticated-user-id": "external-user-2",
    "oai-authenticated-user-email": "returning@example.com",
  });

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();

  assert.match(html, /Jornada\s*<em>SVO<\/em>/);
  assert.match(html, /data-stage-id="SVO-LISTENING-01"/);
  const stageStart = html.indexOf('data-stage-id="SVO-LISTENING-01"');
  const stageEnd = html.indexOf("</section>", stageStart);
  const stageHtml = html.slice(stageStart, stageEnd);
  assert.match(stageHtml, /SVO-01/);
  assert.match(stageHtml, /Listening 01/);
  assert.match(stageHtml, /data-stage-progress="0\/2"/);
  assert.match(stageHtml, /data-stage-state="current"/);
  assert.match(stageHtml, /data-activity-state="current"/);
  assert.match(stageHtml, /data-activity-state="locked"/);
  assert.match(stageHtml, /Etapa 01/);
  assert.match(stageHtml, /0<!-- -->\/2/);
  assert.match(stageHtml, /concluídas/);
  assert.match(stageHtml, /1A · SVO-01/);
  assert.match(stageHtml, /1B · Listening 01/);
  assert.match(stageHtml, /aria-label="SVO to Listening"/);
  assert.match(html, /data-stage-id="SVO-LISTENING-02"/);
  const stage02Start = html.indexOf('data-stage-id="SVO-LISTENING-02"');
  const stage02End = html.indexOf("</section>", stage02Start);
  const stage02Html = html.slice(stage02Start, stage02End);
  assert.match(stage02Html, /SVO-02/);
  assert.match(stage02Html, /Listening 02/);
  assert.match(stage02Html, /data-stage-progress="0\/2"/);
  assert.match(stage02Html, /data-stage-state="locked"/);
  assert.equal(
    stage02Html.match(/data-activity-state="locked"/g)?.length,
    2,
  );
  assert.match(stage02Html, /Etapa 02/);
  assert.match(stage02Html, /0<!-- -->\/2/);
  assert.match(stage02Html, /concluídas/);
  assert.match(stage02Html, /2A · SVO-02/);
  assert.match(stage02Html, /2B · Listening 02/);
  assert.match(stage02Html, /aria-label="SVO to Listening"/);
  assert.match(html, /data-stage-id="SVO-LISTENING-03"/);
  const stage03Start = html.indexOf('data-stage-id="SVO-LISTENING-03"');
  const stage03End = html.indexOf("</section>", stage03Start);
  const stage03Html = html.slice(stage03Start, stage03End);
  assert.match(stage03Html, /SVO-03/);
  assert.match(stage03Html, /Listening 03/);
  assert.match(stage03Html, /data-stage-progress="0\/2"/);
  assert.match(stage03Html, /data-stage-state="locked"/);
  assert.equal(
    stage03Html.match(/data-activity-state="locked"/g)?.length,
    2,
  );
  assert.match(stage03Html, /Etapa 03/);
  assert.match(stage03Html, /0<!-- -->\/2/);
  assert.match(stage03Html, /concluídas/);
  assert.match(stage03Html, /3A · SVO-03/);
  assert.match(stage03Html, /3B · Listening 03/);
  assert.match(stage03Html, /aria-label="SVO to Listening"/);
  assert.match(html, /data-stage-id="SVO-LISTENING-04"/);
  const stage04Start = html.indexOf('data-stage-id="SVO-LISTENING-04"');
  const stage04End = html.indexOf("</section>", stage04Start);
  const stage04Html = html.slice(stage04Start, stage04End);
  assert.match(stage04Html, /SVO-04/);
  assert.match(stage04Html, /Listening 04/);
  assert.match(stage04Html, /data-stage-progress="0\/2"/);
  assert.match(stage04Html, /data-stage-state="locked"/);
  assert.equal(
    stage04Html.match(/data-activity-state="locked"/g)?.length,
    2,
  );
  assert.match(stage04Html, /Etapa 04/);
  assert.match(stage04Html, /0<!-- -->\/2/);
  assert.match(stage04Html, /concluídas/);
  assert.match(stage04Html, /4A · SVO-04/);
  assert.match(stage04Html, /4B · Listening 04/);
  assert.match(stage04Html, /aria-label="SVO to Listening"/);
  assert.match(html, /data-stage-id="SVO-LISTENING-05"/);
  const stage05Start = html.indexOf('data-stage-id="SVO-LISTENING-05"');
  const stage05End = html.indexOf("</section>", stage05Start);
  const stage05Html = html.slice(stage05Start, stage05End);
  assert.match(stage05Html, /SVO-05/);
  assert.match(stage05Html, /Listening 05/);
  assert.match(stage05Html, /data-activity-id="LISTEN-SVO-05"/);
  assert.match(stage05Html, /data-stage-progress="0\/2"/);
  assert.match(stage05Html, /data-stage-state="locked"/);
  assert.equal(
    stage05Html.match(/data-activity-state="locked"/g)?.length,
    2,
  );
  assert.match(stage05Html, /Etapa 05/);
  assert.match(stage05Html, /0<!-- -->\/2/);
  assert.match(stage05Html, /concluídas/);
  assert.match(stage05Html, /5A · SVO-05/);
  assert.match(stage05Html, /5B · Listening 05/);
  assert.match(stage05Html, /aria-label="SVO to Listening"/);
  assert.match(html, /SVO-01/);
  assert.match(html, /SVO-02/);
  assert.match(html, /SVO-03/);
  assert.match(html, /SVO-04/);
  assert.match(html, /SVO-05/);
  assert.match(html, /Choose the correct sentence/);
  assert.match(html, /Complete the sentence/);
  assert.match(html, /Sentence challenge/);
  assert.match(html, /Mastery challenge/);
  assert.match(html, /Bloqueada/);
  assert.match(html, /0 de 5 atividades/);
  assert.match(html, /Listening experiment/);
  assert.match(html, /Complete SVO-01 to unlock Listening 01\./);
  assert.match(html, /Listening 02 · Audio-to-sentence reconstruction/);
  assert.match(html, /Listening 03 · Reconstruction with distractors/);
  assert.match(html, /Complete SVO-03 to unlock this activity\./);
  assert.match(html, /Listening 04 · Audio-to-SVO role mapping/);
  assert.match(html, /Complete SVO-04 to unlock this activity\./);
  assert.match(html, /Listening 05 · SVO role-mapping transfer/);
  assert.match(html, /Complete SVO-05 to unlock this activity\./);
  assert.match(html, /data-activity-id="LISTEN-SVO-05"/);
  assert.match(html, /aria-label="Play Listening 05 audio"/);
  assert.match(html, /aria-label="Listening 05 role slots"/);
  assert.match(html, /aria-label="Submit Listening 05 role mapping"/);
  assert.match(html, /aria-label="Listening 05 feedback"/);
  assert.match(html, /Play audio/);
  assert.doesNotMatch(html, /Anna likes music\./);
  assert.doesNotMatch(html, /Maya writes letters\./);
  assert.doesNotMatch(html, /Daniel reads books\./);
  assert.doesNotMatch(html, /Laura plays tennis\./);
  assert.doesNotMatch(html, /Carlos watches movies\./);

  const svo01Position = html.indexOf("SVO-01");
  const listening01Position = html.indexOf("Listening 01");
  const svo02Position = html.indexOf("SVO-02");
  assert.ok(svo01Position >= 0);
  assert.ok(listening01Position > svo01Position);
  assert.ok(svo02Position > listening01Position);
  assert.equal(
    html.match(/Listening 01 · Audio-to-text recognition/g)?.length,
    1,
  );
  const svo02StagePosition = html.indexOf("SVO-02", stage02Start);
  const listening02Position = html.indexOf("Listening 02", stage02Start);
  const svo03Position = html.indexOf("SVO-03", stage02Start);
  assert.ok(svo02StagePosition >= stage02Start);
  assert.ok(listening02Position > svo02StagePosition);
  assert.ok(svo03Position > listening02Position);
  assert.equal(
    html.match(/Listening 02 · Audio-to-sentence reconstruction/g)?.length,
    1,
  );
  const svo03StagePosition = html.indexOf("SVO-03", stage03Start);
  const listening03Position = html.indexOf("Listening 03", stage03Start);
  const svo04Position = html.indexOf("SVO-04", stage03Start);
  assert.ok(svo03StagePosition >= stage03Start);
  assert.ok(listening03Position > svo03StagePosition);
  assert.ok(svo04Position > listening03Position);
  assert.equal(
    html.match(/Listening 03 · Reconstruction with distractors/g)?.length,
    1,
  );
  const svo04StagePosition = html.indexOf("SVO-04", stage04Start);
  const listening04Position = html.indexOf("Listening 04", stage04Start);
  const svo05Position = html.indexOf("SVO-05", stage04Start);
  assert.ok(svo04StagePosition >= stage04Start);
  assert.ok(listening04Position > svo04StagePosition);
  assert.ok(svo05Position > listening04Position);
  assert.equal(
    html.match(/Listening 04 · Audio-to-SVO role mapping/g)?.length,
    1,
  );
  const svo05StagePosition = stage05Html.indexOf("SVO-05");
  const listening05Position = stage05Html.indexOf("Listening 05");
  assert.ok(svo05StagePosition >= 0);
  assert.ok(listening05Position > svo05StagePosition);
  assert.equal(
    html.match(/Listening 05 · SVO role-mapping transfer/g)?.length,
    1,
  );
});

test("presents a secure school login to a visitor without an Ogmiva session or ChatGPT identity", async () => {
  const response = await fetchRenderedHome();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);

  const html = await response.text();
  assert.match(html, /<form\b/);
  assert.match(html, /name="loginId"/);
  assert.match(html, /name="credential"/);
  assert.match(html, /type="password"[^>]*name="credential"|name="credential"[^>]*type="password"/);
  assert.doesNotMatch(html, /name="learnerId"/);
  assert.doesNotMatch(html, /data-stage-id=/);
});

test("restores learner progress from a valid Ogmiva session", async () => {
  const progressRecord = {
    recordId: "progress-learner-2-ogmiva-session",
    learnerId: "learner-2",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-19T10:00:00.000Z",
  };
  const snapshot = {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [progressRecord],
  };
  const lookedUpLearnerIds = [];
  const response = await fetchRenderedHome({
    cookie: "ogmiva_session=valid-session-learner-2",
  }, {
    DB: {
      prepare: (query) => ({
        bind: (...values) => ({
          first: async () => {
            if (/FROM learner_sessions/.test(query)) {
              return {
                userId: "school-user-2",
                externalUserId: "school-user-2",
                learnerId: "learner-2",
              };
            }

            if (values.includes("learner-2")) {
              lookedUpLearnerIds.push("learner-2");
              return { snapshot: JSON.stringify(snapshot) };
            }

            return null;
          },
        }),
      }),
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(lookedUpLearnerIds, ["learner-2"]);
  const html = await response.text();
  const stageStart = html.indexOf('data-stage-id="SVO-LISTENING-01"');
  const stageEnd = html.indexOf("</section>", stageStart);
  const stageHtml = html.slice(stageStart, stageEnd);
  assert.match(stageHtml, /data-stage-progress="2\/2"/);
  assert.match(stageHtml, /data-stage-state="complete"/);
  assert.match(html, /progress-learner-2-ogmiva-session/);
});

test("presents Ogmiva logout only for a journey resolved from an Ogmiva session", async () => {
  const sessionResponse = await fetchRenderedHome({
    cookie: "ogmiva_session=valid-session-learner-2",
  }, {
    DB: {
      prepare: (query) => ({
        bind: () => ({
          first: async () => /FROM learner_sessions/.test(query)
            ? { learnerId: "learner-2" }
            : null,
        }),
      }),
    },
  });

  assert.equal(sessionResponse.status, 200);
  const sessionHtml = await sessionResponse.text();
  assert.match(
    sessionHtml,
    /<form[^>]*(?:action="\/api\/learner-logout"[^>]*method="post"|method="post"[^>]*action="\/api\/learner-logout")[^>]*>/,
  );
  assert.match(sessionHtml, />Sair<\/button>/);
  assert.match(sessionHtml, /data-stage-id=/);

  const chatGPTResponse = await fetchRenderedHome({
    "oai-authenticated-user-id": "external-user-2",
    "oai-authenticated-user-email": "returning@example.com",
  });

  assert.equal(chatGPTResponse.status, 200);
  const chatGPTHtml = await chatGPTResponse.text();
  assert.doesNotMatch(chatGPTHtml, /action="\/api\/learner-logout"/);
  assert.match(chatGPTHtml, /data-stage-id=/);
});

test("issues a secure Ogmiva session for an authenticated associated learner", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const savedSessions = [];
  const response = await worker.fetch(
    new Request("http://localhost/api/learner-session", {
      method: "POST",
      headers: {
        "oai-authenticated-user-id": "external-user-2",
        "oai-authenticated-user-email": "returning@example.com",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {
        prepare: (query) => ({
          bind: (...values) => ({
            run: async () => {
              if (/INSERT INTO learner_sessions/.test(query)) {
                savedSessions.push(values);
              }
            },
          }),
        }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 204);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, /^ogmiva_session=[^;]+/);
  assert.match(setCookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(setCookie, /;\s*Secure(?:;|$)/i);
  assert.match(setCookie, /;\s*SameSite=Lax(?:;|$)/i);
  assert.match(setCookie, /;\s*Path=\/(?:;|$)/i);

  const sessionToken = setCookie.match(/^ogmiva_session=([^;]+)/)?.[1];
  assert.ok(sessionToken);
  assert.ok(sessionToken.length >= 32);
  assert.equal(savedSessions.length, 1);
  const [storedTokenRepresentation, learnerId, expiresAt] = savedSessions[0];
  assert.notEqual(storedTokenRepresentation, sessionToken);
  assert.equal(learnerId, "learner-2");
  assert.ok(typeof expiresAt === "string" && expiresAt.length > 0);
});

test("issues a secure Ogmiva session for a provisioned learner account with valid credentials", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const loginId = "school-user-2";
  const credential = "correct learner credential";
  const credentialVerifier = await createPbkdf2CredentialVerifier(
    credential,
    new TextEncoder().encode("ogmiva-test-salt"),
  );
  const lookedUpLoginIds = [];
  const savedSessions = [];
  const response = await worker.fetch(
    new Request("http://localhost/api/learner-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        loginId,
        credential,
        learnerId: "learner-chosen-by-client",
      }),
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {
        prepare: (query) => ({
          bind: (...values) => ({
            first: async () => {
              if (!/FROM learner_accounts/.test(query)) return null;

              lookedUpLoginIds.push(values[0]);
              return {
                learnerId: "learner-2",
                credentialVerifier,
              };
            },
            run: async () => {
              if (/INSERT INTO learner_sessions/.test(query)) {
                savedSessions.push(values);
              }
            },
          }),
        }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 204);
  assert.deepEqual(lookedUpLoginIds, [loginId]);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, /^ogmiva_session=[^;]+/);
  assert.match(setCookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(setCookie, /;\s*Secure(?:;|$)/i);
  assert.match(setCookie, /;\s*SameSite=Lax(?:;|$)/i);
  assert.match(setCookie, /;\s*Path=\/(?:;|$)/i);

  const sessionToken = setCookie.match(/^ogmiva_session=([^;]+)/)?.[1];
  assert.ok(sessionToken);
  assert.equal(savedSessions.length, 1);
  const [storedTokenRepresentation, learnerId, expiresAt] = savedSessions[0];
  assert.notEqual(storedTokenRepresentation, sessionToken);
  assert.equal(learnerId, "learner-2");
  assert.notEqual(learnerId, "learner-chosen-by-client");
  assert.ok(typeof expiresAt === "string" && expiresAt.length > 0);
});

test("logs in with a PBKDF2 learner account provisioned in an empty migrated D1", async (t) => {
  const { database, miniflare } = await createMigratedOgmivaHarness(
    t,
    "learner-account",
  );

  const loginId = "school-user-2";
  const credential = "correct learner credential";
  const credentialVerifier = await createPbkdf2CredentialVerifier(
    credential,
    new TextEncoder().encode("ogmiva-integration-test-salt"),
  );

  await database.prepare(`
    INSERT INTO learner_accounts (
      login_id,
      learner_id,
      credential_hash
    ) VALUES (?, ?, ?)
  `).bind(loginId, "learner-2", credentialVerifier).run();

  const storedAccount = await database.prepare(`
    SELECT
      login_id AS loginId,
      learner_id AS learnerId,
      credential_hash AS credentialHash
    FROM learner_accounts
    WHERE login_id = ?
  `).bind(loginId).first();
  assert.deepEqual(storedAccount, {
    loginId,
    learnerId: "learner-2",
    credentialHash: credentialVerifier,
  });

  const response = await miniflare.dispatchFetch(
    "http://localhost/api/learner-login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        loginId,
        credential,
        learnerId: "learner-chosen-by-client",
      }),
    },
  );

  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie") ?? "", /^ogmiva_session=[^;]+/);
  const storedSession = await database.prepare(`
    SELECT learner_id AS learnerId
    FROM learner_sessions
  `).first();
  assert.deepEqual(storedSession, { learnerId: "learner-2" });
});

test("submits the school login form and restores the provisioned learner journey", async (t) => {
  const { database, miniflare } = await createMigratedOgmivaHarness(
    t,
    "learner-form-login",
  );

  const loginId = "school-user-2";
  const credential = "correct learner credential";
  const credentialVerifier = await createPbkdf2CredentialVerifier(
    credential,
    new TextEncoder().encode("ogmiva-form-login-test-salt"),
  );
  const progressRecord = {
    recordId: "progress-learner-2-school-login",
    learnerId: "learner-2",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-20T10:00:00.000Z",
  };
  const snapshot = {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [progressRecord],
  };

  await database.prepare(`
    INSERT INTO learner_accounts (
      login_id,
      learner_id,
      credential_hash
    ) VALUES (?, ?, ?)
  `).bind(loginId, "learner-2", credentialVerifier).run();
  await database.prepare(`
    INSERT INTO learner_progress (
      learner_id,
      snapshot,
      updated_at
    ) VALUES (?, ?, CURRENT_TIMESTAMP)
  `).bind("learner-2", JSON.stringify(snapshot)).run();

  const loginResponse = await miniflare.dispatchFetch(
    "http://localhost/api/learner-login",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ loginId, credential }).toString(),
      redirect: "manual",
    },
  );

  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get("location"), "/");
  const setCookie = loginResponse.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, /^ogmiva_session=[^;]+/);
  assert.match(setCookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(setCookie, /;\s*Secure(?:;|$)/i);
  assert.match(setCookie, /;\s*SameSite=Lax(?:;|$)/i);

  const journeyResponse = await miniflare.dispatchFetch(
    "http://localhost/",
    {
      headers: {
        accept: "text/html",
        cookie: setCookie.split(";", 1)[0],
      },
    },
  );

  assert.equal(journeyResponse.status, 200);
  const html = await journeyResponse.text();
  const stageStart = html.indexOf('data-stage-id="SVO-LISTENING-01"');
  const stageEnd = html.indexOf("</section>", stageStart);
  const stageHtml = html.slice(stageStart, stageEnd);
  assert.match(stageHtml, /data-stage-progress="2\/2"/);
  assert.match(stageHtml, /data-stage-state="complete"/);
  assert.match(html, /progress-learner-2-school-login/);
});

test("returns an invalid school credential to the login form without creating a session", async (t) => {
  const { database, miniflare } = await createMigratedOgmivaHarness(
    t,
    "learner-invalid-form-login",
  );
  const loginId = "school-user-2";
  const credentialVerifier = await createPbkdf2CredentialVerifier(
    "correct learner credential",
    new TextEncoder().encode("ogmiva-invalid-form-login-test-salt"),
  );

  await database.prepare(`
    INSERT INTO learner_accounts (
      login_id,
      learner_id,
      credential_hash
    ) VALUES (?, ?, ?)
  `).bind(loginId, "learner-2", credentialVerifier).run();

  const loginResponse = await miniflare.dispatchFetch(
    "http://localhost/api/learner-login",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        loginId,
        credential: "incorrect learner credential",
      }).toString(),
      redirect: "manual",
    },
  );

  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get("location"), "/?login=failed");
  assert.equal(loginResponse.headers.get("set-cookie"), null);
  const storedSessions = await database.prepare(`
    SELECT COUNT(*) AS sessionCount
    FROM learner_sessions
  `).first();
  assert.equal(storedSessions?.sessionCount, 0);

  const formResponse = await miniflare.dispatchFetch(
    new URL(loginResponse.headers.get("location"), "http://localhost"),
    { headers: { accept: "text/html" } },
  );

  assert.equal(formResponse.status, 200);
  const html = await formResponse.text();
  assert.match(html, /Não foi possível entrar\. Verifique seus dados e tente novamente\./);
  assert.match(html, /name="loginId"/);
  assert.match(html, /name="credential"/);
  assert.doesNotMatch(html, /identificador não encontrado|credencial incorreta/i);
  assert.doesNotMatch(html, /data-stage-id=/);
});

test("invalidates only the submitted Ogmiva session and expires its cookie", async (t) => {
  const { database, miniflare } = await createMigratedOgmivaHarness(
    t,
    "learner-logout",
  );
  const loginId = "school-user-2";
  const credential = "correct learner credential";
  const credentialVerifier = await createPbkdf2CredentialVerifier(
    credential,
    new TextEncoder().encode("ogmiva-logout-test-salt"),
  );

  await database.prepare(`
    INSERT INTO learner_accounts (
      login_id,
      learner_id,
      credential_hash
    ) VALUES (?, ?, ?)
  `).bind(loginId, "learner-2", credentialVerifier).run();

  const logIn = async () => {
    const response = await miniflare.dispatchFetch(
      "http://localhost/api/learner-login",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ loginId, credential }).toString(),
        redirect: "manual",
      },
    );
    assert.equal(response.status, 303);
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie);
    return setCookie.split(";", 1)[0];
  };

  const sessionCookieToEnd = await logIn();
  const sessionCookieToKeep = await logIn();
  const sessionsBeforeLogout = await database.prepare(`
    SELECT COUNT(*) AS sessionCount
    FROM learner_sessions
  `).first();
  assert.equal(sessionsBeforeLogout?.sessionCount, 2);

  const logoutResponse = await miniflare.dispatchFetch(
    "http://localhost/api/learner-logout",
    {
      method: "POST",
      headers: { cookie: sessionCookieToEnd },
      redirect: "manual",
    },
  );

  assert.equal(logoutResponse.status, 303);
  assert.equal(logoutResponse.headers.get("location"), "/");
  const expiredCookie = logoutResponse.headers.get("set-cookie");
  assert.ok(expiredCookie);
  assert.match(expiredCookie, /^ogmiva_session=;/);
  assert.match(expiredCookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(expiredCookie, /;\s*Secure(?:;|$)/i);
  assert.match(expiredCookie, /;\s*SameSite=Lax(?:;|$)/i);
  assert.match(expiredCookie, /;\s*Path=\/(?:;|$)/i);
  assert.match(expiredCookie, /;\s*Max-Age=0(?:;|$)/i);
  assert.match(expiredCookie, /;\s*Expires=Thu, 01 Jan 1970 00:00:00 GMT(?:;|$)/i);

  const sessionsAfterLogout = await database.prepare(`
    SELECT COUNT(*) AS sessionCount
    FROM learner_sessions
  `).first();
  assert.equal(sessionsAfterLogout?.sessionCount, 1);

  const endedSessionResponse = await miniflare.dispatchFetch(
    "http://localhost/",
    {
      headers: { accept: "text/html", cookie: sessionCookieToEnd },
    },
  );
  assert.equal(endedSessionResponse.status, 200);
  const endedSessionHtml = await endedSessionResponse.text();
  assert.match(endedSessionHtml, /name="loginId"/);
  assert.doesNotMatch(endedSessionHtml, /data-stage-id=/);

  const keptSessionResponse = await miniflare.dispatchFetch(
    "http://localhost/",
    {
      headers: { accept: "text/html", cookie: sessionCookieToKeep },
    },
  );
  assert.equal(keptSessionResponse.status, 200);
  assert.match(await keptSessionResponse.text(), /data-stage-id=/);
});

test("provisions one learner account locally without storing or returning its credential", async (t) => {
  const miniflare = new Miniflare({
    modules: true,
    script: `export default {
      fetch() { return new Response(null, { status: 204 }); }
    }`,
    compatibilityDate: "2026-05-15",
    d1Databases: { DB: `learner-provisioning-${process.pid}-${Date.now()}` },
  });
  t.after(() => miniflare.dispose());

  const database = await miniflare.getD1Database("DB");
  await applyD1Migrations(database);

  const provisionerUrl = new URL(
    "../scripts/provision-learner-account.mjs",
    import.meta.url,
  );
  let provisioningModule = {};
  try {
    provisioningModule = await import(provisionerUrl.href);
  } catch (error) {
    if (
      error?.code !== "ERR_MODULE_NOT_FOUND"
      || !error.message.includes(fileURLToPath(provisionerUrl))
    ) {
      throw error;
    }
  }

  const { provisionLearnerAccount } = provisioningModule;
  assert.equal(
    typeof provisionLearnerAccount,
    "function",
    "the local administrative learner-account provisioner is not implemented",
  );

  const loginId = "school-user-2";
  const learnerId = "learner-2";
  const credential = "credential supplied only to the provisioner";
  const result = await provisionLearnerAccount({
    database,
    loginId,
    learnerId,
    credential,
  });

  const storedAccount = await database.prepare(`
    SELECT
      login_id AS loginId,
      learner_id AS learnerId,
      credential_hash AS credentialHash
    FROM learner_accounts
    WHERE login_id = ?
  `).bind(loginId).first();

  assert.equal(storedAccount?.loginId, loginId);
  assert.equal(storedAccount?.learnerId, learnerId);
  assert.match(
    storedAccount?.credentialHash ?? "",
    /^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
  );
  assert.notEqual(storedAccount?.credentialHash, credential);
  assert.ok(!JSON.stringify(storedAccount).includes(credential));
  assert.ok(!JSON.stringify(result ?? null).includes(credential));
});

test("provisions and authenticates a learner account within the Cloudflare Worker PBKDF2 limit", { concurrency: false }, async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const runtimeCrypto = globalThis.crypto;
  const storedAccounts = [];
  const credential = "credential accepted by the Worker runtime";

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues: runtimeCrypto.getRandomValues.bind(runtimeCrypto),
      subtle: {
        importKey: runtimeCrypto.subtle.importKey.bind(runtimeCrypto.subtle),
        deriveBits: (algorithm, key, length) => {
          if (algorithm.iterations > 100_000) {
            throw new DOMException(
              `Pbkdf2 failed: iteration counts above 100000 are not supported (requested ${algorithm.iterations}).`,
              "NotSupportedError",
            );
          }

          return runtimeCrypto.subtle.deriveBits(algorithm, key, length);
        },
      },
    },
  });

  try {
    await provisionLearnerAccount({
      database: {
        prepare: () => ({
          bind: (...values) => ({
            run: async () => storedAccounts.push(values),
          }),
        }),
      },
      loginId: "school-user-2",
      learnerId: "learner-2",
      credential,
    });

    assert.equal(storedAccounts.length, 1);
    const [loginId, learnerId, credentialVerifier] = storedAccounts[0];
    assert.equal(loginId, "school-user-2");
    assert.equal(learnerId, "learner-2");
    assert.match(
      credentialVerifier,
      /^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
    assert.equal(
      await verifyPbkdf2Credential(credential, credentialVerifier),
      true,
    );
    assert.equal(
      await verifyPbkdf2Credential("incorrect credential", credentialVerifier),
      false,
    );
  } finally {
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    } else {
      delete globalThis.crypto;
    }
  }
});

test("rejects an invalid administrative provisioning secret without creating an account", async (t) => {
  const { database, miniflare } =
    await createAdministrativeProvisioningHarness(t, "invalid-secret");

  const response = await miniflare.dispatchFetch(
    "http://localhost/api/admin/learner-accounts",
    {
      method: "POST",
      headers: {
        authorization: "Bearer incorrect administrative secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        loginId: "school-user-2",
        learnerId: "learner-2",
        credential: "credential that must not be persisted",
      }),
    },
  );

  const storedAccounts = await database.prepare(`
    SELECT COUNT(*) AS accountCount
    FROM learner_accounts
  `).first();
  assert.equal(storedAccounts?.accountCount, 0);
  assert.equal(response.status, 401);
});

test("rejects an invalid administrative deprovisioning secret without deleting accounts", async (t) => {
  const { database, miniflare } =
    await createAdministrativeProvisioningHarness(t, "invalid-delete-secret");
  const storedAccounts = [
    {
      loginId: "school-user-to-delete",
      learnerId: "learner-2",
      credentialHash: "preserved target credential verifier",
    },
    {
      loginId: "school-user-to-preserve",
      learnerId: "learner-3",
      credentialHash: "preserved other credential verifier",
    },
  ];
  for (const account of storedAccounts) {
    await database.prepare(`
      INSERT INTO learner_accounts (
        login_id,
        learner_id,
        credential_hash
      ) VALUES (?, ?, ?)
    `).bind(
      account.loginId,
      account.learnerId,
      account.credentialHash,
    ).run();
  }

  const response = await miniflare.dispatchFetch(
    "http://localhost/api/admin/learner-accounts",
    {
      method: "DELETE",
      headers: {
        authorization: "Bearer incorrect administrative secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ loginId: storedAccounts[0].loginId }),
    },
  );

  const remainingAccounts = await database.prepare(`
    SELECT
      login_id AS loginId,
      learner_id AS learnerId,
      credential_hash AS credentialHash
    FROM learner_accounts
    ORDER BY login_id
  `).all();
  assert.deepEqual(
    {
      status: response.status,
      remainingAccounts: remainingAccounts.results,
    },
    {
      status: 401,
      remainingAccounts: [...storedAccounts].sort(
        (left, right) => left.loginId.localeCompare(right.loginId),
      ),
    },
  );
});

test("deprovisions only the explicitly identified learner account", async (t) => {
  const { database, miniflare, provisioningSecret } =
    await createAdministrativeProvisioningHarness(t, "authorized-delete");
  const accountToDelete = {
    loginId: "school-user-to-delete",
    learnerId: "learner-2",
    credentialHash: "deleted credential verifier",
  };
  const accountToPreserve = {
    loginId: "school-user-to-preserve",
    learnerId: "learner-3",
    credentialHash: "preserved credential verifier",
  };
  for (const account of [accountToDelete, accountToPreserve]) {
    await database.prepare(`
      INSERT INTO learner_accounts (
        login_id,
        learner_id,
        credential_hash
      ) VALUES (?, ?, ?)
    `).bind(
      account.loginId,
      account.learnerId,
      account.credentialHash,
    ).run();
  }

  const response = await miniflare.dispatchFetch(
    "http://localhost/api/admin/learner-accounts",
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${provisioningSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ loginId: accountToDelete.loginId }),
    },
  );

  const remainingAccounts = await database.prepare(`
    SELECT
      login_id AS loginId,
      learner_id AS learnerId,
      credential_hash AS credentialHash
    FROM learner_accounts
    ORDER BY login_id
  `).all();
  assert.deepEqual(
    {
      status: response.status,
      remainingAccounts: remainingAccounts.results,
    },
    {
      status: 204,
      remainingAccounts: [accountToPreserve],
    },
  );
});

test("provisions one learner account with the correct administrative secret", async (t) => {
  const { database, miniflare, provisioningSecret } =
    await createAdministrativeProvisioningHarness(t, "authorized");

  const loginId = "school-user-2";
  const learnerId = "learner-2";
  const credential = "credential supplied to the authorized provisioner";
  const response = await miniflare.dispatchFetch(
    "http://localhost/api/admin/learner-accounts",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${provisioningSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ loginId, learnerId, credential }),
    },
  );

  assert.equal(response.status, 204);
  const storedAccount = await database.prepare(`
    SELECT
      login_id AS loginId,
      learner_id AS learnerId,
      credential_hash AS credentialHash
    FROM learner_accounts
    WHERE login_id = ?
  `).bind(loginId).first();
  assert.equal(storedAccount?.loginId, loginId);
  assert.equal(storedAccount?.learnerId, learnerId);
  assert.match(
    storedAccount?.credentialHash ?? "",
    /^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
  );
  assert.notEqual(storedAccount?.credentialHash, credential);
  assert.ok(!JSON.stringify(storedAccount).includes(credential));
});

test("rejects an invalid administrative provisioning payload without creating an account", async (t) => {
  const { database, miniflare, provisioningSecret } =
    await createAdministrativeProvisioningHarness(t, "invalid-payload");

  const response = await miniflare.dispatchFetch(
    "http://localhost/api/admin/learner-accounts",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${provisioningSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        loginId: "school-user-3",
        learnerId: "learner-3",
        credential: "",
      }),
    },
  );

  const storedAccounts = await database.prepare(`
    SELECT COUNT(*) AS accountCount
    FROM learner_accounts
  `).first();
  assert.deepEqual(
    {
      status: response.status,
      accountCount: storedAccounts?.accountCount,
    },
    { status: 400, accountCount: 0 },
  );
});

test("rejects reprovisioning an existing login without changing its learner association", async (t) => {
  const { database, miniflare, provisioningSecret } =
    await createAdministrativeProvisioningHarness(t, "existing-login");
  const loginId = "school-user-2";
  const originalCredentialVerifier = await createPbkdf2CredentialVerifier(
    "original credential",
  );
  await database.prepare(`
    INSERT INTO learner_accounts (
      login_id,
      learner_id,
      credential_hash
    ) VALUES (?, ?, ?)
  `).bind(loginId, "learner-2", originalCredentialVerifier).run();

  const response = await miniflare.dispatchFetch(
    "http://localhost/api/admin/learner-accounts",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${provisioningSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        loginId,
        learnerId: "learner-3",
        credential: "replacement credential",
      }),
    },
  );

  const storedAccount = await database.prepare(`
    SELECT
      learner_id AS learnerId,
      credential_hash AS credentialVerifier
    FROM learner_accounts
    WHERE login_id = ?
  `).bind(loginId).first();
  assert.deepEqual(
    {
      status: response.status,
      storedAccount,
    },
    {
      status: 409,
      storedAccount: {
        learnerId: "learner-2",
        credentialVerifier: originalCredentialVerifier,
      },
    },
  );
});

test("renders the journey for the configured returning learner", async () => {
  const response = await fetchRenderedHome({
    "oai-authenticated-user-id": "external-user-2",
    "oai-authenticated-user-email": "returning@example.com",
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /\\"learnerId\\":\\"learner-2\\"/);
});

test("restores D1 progress for the authenticated resolved learner", async () => {
  const lookedUpLearnerIds = [];
  const progressRecord = {
    recordId: "progress-learner-2-1",
    learnerId: "learner-2",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-13T10:00:00.000Z",
  };
  const snapshot = {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [progressRecord],
  };
  const response = await fetchRenderedHome({
    "oai-authenticated-user-id": "external-user-2",
    "oai-authenticated-user-email": "returning@example.com",
  }, {
    DB: {
      prepare: () => ({
        bind: (learnerId) => ({
          first: async () => {
            lookedUpLearnerIds.push(learnerId);
            return { snapshot: JSON.stringify(snapshot) };
          },
        }),
      }),
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(lookedUpLearnerIds, ["learner-2"]);
  const html = await response.text();
  const stageStart = html.indexOf('data-stage-id="SVO-LISTENING-01"');
  const stageEnd = html.indexOf("</section>", stageStart);
  const stageHtml = html.slice(stageStart, stageEnd);
  assert.match(stageHtml, /data-stage-progress="2\/2"/);
  assert.match(stageHtml, /data-stage-state="complete"/);
  assert.match(html, /progress-learner-2-1/);
});

test("saves completed Listening 01 progress under the authenticated resolved learner", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const savedSnapshots = [];
  const progressRecord = {
    recordId: "progress-listening-01-1",
    learnerId: "learner-chosen-by-client",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-14T10:00:00.000Z",
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/learner-progress", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-id": "external-user-2",
        "oai-authenticated-user-email": "returning@example.com",
      },
      body: JSON.stringify({
        learnerId: "learner-chosen-by-client",
        completedActivityIds: ["SVO-01"],
        completedListeningActivityIds: ["LISTEN-SVO-01"],
        progressRecords: [progressRecord],
      }),
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {
        prepare: (query) => ({
          bind: (...values) => ({
            first: async () => null,
            run: async () => {
              if (/INSERT INTO learner_progress/.test(query)) {
                savedSnapshots.push(values);
              }
            },
          }),
        }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 204);
  assert.equal(savedSnapshots.length, 1);
  const [savedLearnerId, savedSnapshotJson] = savedSnapshots[0];
  assert.equal(savedLearnerId, "learner-2");
  assert.deepEqual(JSON.parse(savedSnapshotJson), {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [{ ...progressRecord, learnerId: "learner-2" }],
  });
});

test("saves learner progress under the learner resolved from a valid Ogmiva session", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const savedSnapshots = [];
  const progressRecord = {
    recordId: "progress-ogmiva-session-listening-01",
    learnerId: "learner-chosen-by-client",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-19T11:00:00.000Z",
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/learner-progress", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "ogmiva_session=valid-session-learner-2",
      },
      body: JSON.stringify({
        learnerId: "learner-chosen-by-client",
        completedActivityIds: ["SVO-01"],
        completedListeningActivityIds: ["LISTEN-SVO-01"],
        progressRecords: [progressRecord],
      }),
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {
        prepare: (query) => ({
          bind: (...values) => ({
            first: async () => /FROM learner_sessions/.test(query)
              ? { learnerId: "learner-2" }
              : null,
            run: async () => {
              if (/INSERT INTO learner_progress/.test(query)) {
                savedSnapshots.push(values);
              }
            },
          }),
        }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 204);
  assert.equal(savedSnapshots.length, 1);
  const [savedLearnerId, savedSnapshotJson] = savedSnapshots[0];
  assert.equal(savedLearnerId, "learner-2");
  assert.deepEqual(JSON.parse(savedSnapshotJson), {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [{ ...progressRecord, learnerId: "learner-2" }],
  });
});

test("preserves persisted D1 progress records when a later authenticated snapshot omits them", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const progressRecord = {
    recordId: "progress-listening-01-1",
    learnerId: "learner-2",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-14T10:00:00.000Z",
  };
  const storedSnapshot = {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [progressRecord],
  };
  let savedSnapshot = null;
  const response = await worker.fetch(
    new Request("http://localhost/api/learner-progress", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-id": "external-user-2",
        "oai-authenticated-user-email": "returning@example.com",
      },
      body: JSON.stringify({
        learnerId: "learner-2",
        completedActivityIds: ["SVO-01", "SVO-02"],
        completedListeningActivityIds: ["LISTEN-SVO-01"],
      }),
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {
        prepare: (query) => ({
          bind: (...values) => ({
            first: async () => /SELECT snapshot/.test(query)
              ? { snapshot: JSON.stringify(storedSnapshot) }
              : null,
            run: async () => {
              if (/INSERT INTO learner_progress/.test(query)) {
                savedSnapshot = JSON.parse(values[1]);
              }
            },
          }),
        }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 204);
  assert.deepEqual(savedSnapshot, {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01", "SVO-02"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [progressRecord],
  });
});

test("sends learner journey progress to the authenticated persistence endpoint", async (t) => {
  const { persistLearnerJourneyProgress } =
    await importAppModuleWithLocalProgress(
      "../app/learner-progress-client.ts",
      "learner-progress-client.ts",
    );
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 204 });
  });
  const storedProgress = new Map();
  const snapshot = {
    learnerId: "learner-2",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [{
      recordId: "progress-listening-01-1",
      learnerId: "learner-2",
      activityId: "LISTEN-SVO-01",
      skillId: "listening-svo-recognition",
      completed: true,
      score: 1,
      attemptNumber: 1,
      timeSpentSeconds: 12,
      recordedAt: "2026-09-14T10:00:00.000Z",
    }],
  };

  await persistLearnerJourneyProgress({
    getItem: (key) => storedProgress.get(key) ?? null,
    setItem: (key, value) => storedProgress.set(key, value),
  }, snapshot);

  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.url, "http://localhost/api/learner-progress");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("content-type"), "application/json");
  assert.deepEqual(await request.json(), snapshot);
});

test("does not render a learner journey when the external identity has no learner association", async () => {
  const response = await fetchRenderedHome({
    "oai-authenticated-user-id": "unassociated-external-user",
    "oai-authenticated-user-email": "unassociated@example.com",
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /\\"learnerId\\":/);
});

test("styles current, complete, and locked states in the first paired stage", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /journey-stage--pilot\[data-stage-state="current"\]/);
  assert.match(css, /journey-stage--pilot\[data-stage-state="complete"\]/);
  assert.match(css, /paired-activity\[data-activity-state="locked"\]/);
});

test("marks Listening 05 as the end of the current journey", async () => {
  const pageSource = await readFile(new URL("../app/learner-journey.tsx", import.meta.url), "utf8");

  assert.match(pageSource, /Jornada concluída/);
});

test("submits a Listening 01 choice through the application pipeline", async () => {
  const activityEngine = new ActivityEngine();
  const activity = {
    id: "LISTEN-SVO-01-INTEGRATION",
    title: "Identify the sentence you hear",
    type: "sentence-recognition",
    level: "sentence",
    pattern: "SVO",
    availableUnits: [
      "Anna likes music.",
      "Likes Anna music.",
      "Music Anna likes.",
    ],
    expectedUnits: ["Music Anna likes."],
    skillIds: ["listening-svo-recognition-integration"],
  };
  activityEngine.register(activity);
  const registeredActivity = activityEngine.get(activity.id);
  assert.ok(registeredActivity);
  const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);
  const createdSession = await sessionEngine.createSession({
    learnerId: "learner-1",
    activityId: registeredActivity.id,
  });
  const session = await sessionEngine.startSession(createdSession.sessionId);
  const evidenceEngine = new EvidenceEngine();
  const assessmentEngine = new AssessmentEngine();
  const progressEngine = new DefaultProgressEngine();

  const incorrectResult = await checkListening01Answer({
    selectedAnswer: "Anna likes music.",
    activity: registeredActivity,
    session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });
  const correctResult = await checkListening01Answer({
    selectedAnswer: "Music Anna likes.",
    activity: registeredActivity,
    session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });

  assert.equal(incorrectResult.session?.status, "active");
  assert.equal(correctResult.session?.status, "completed");
  assert.equal(incorrectResult.interaction?.learnerId, session.learnerId);
  assert.equal(incorrectResult.interaction?.sessionId, session.sessionId);
  assert.equal(correctResult.feedback, "correct");
  assert.equal(session.activityId, registeredActivity.id);
  assert.equal(correctResult.interaction?.sessionId, session.sessionId);
  assert.deepEqual(correctResult.interaction?.payload.submittedUnits, ["Music Anna likes."]);
  assert.deepEqual(correctResult.evidence?.data.submittedUnits, ["Music Anna likes."]);
  assert.equal(correctResult.assessment?.correct, true);
  assert.equal(correctResult.progress?.activityId, activity.id);
  assert.equal(correctResult.progress?.skillId, activity.skillIds[0]);
  assert.equal(correctResult.progress?.score, 1);
  assert.equal(correctResult.progress?.attemptNumber, 2);

  assert.equal(incorrectResult.feedback, "incorrect");
  assert.deepEqual(incorrectResult.interaction?.payload.submittedUnits, ["Anna likes music."]);
  assert.deepEqual(incorrectResult.evidence?.data.submittedUnits, ["Anna likes music."]);
  assert.equal(incorrectResult.assessment?.correct, false);
  assert.equal(incorrectResult.progress?.score, 0);
  assert.equal(incorrectResult.progress?.attemptNumber, 1);
});

test("assesses a recognized Speaking 01 attempt for the learner in the session without persisting audio", async () => {
  const activityEngine = new ActivityEngine();
  const activity = {
    id: "SPEAK-SVO-01",
    title: "Say the sentence",
    type: "speech-production",
    level: "sentence",
    pattern: "SVO",
    availableUnits: ["Anna likes music."],
    expectedUnits: ["Anna likes music."],
    skillIds: ["basic-svo-speaking"],
  };
  activityEngine.register(activity);
  const registeredActivity = activityEngine.get(activity.id);
  assert.ok(registeredActivity);
  const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);
  const createdSession = await sessionEngine.createSession({
    learnerId: "learner-2",
    activityId: registeredActivity.id,
  });
  const session = await sessionEngine.startSession(createdSession.sessionId);

  const result = await submitSpeaking01Attempt({
    recognition: { recognizedText: "Anna likes music." },
    activity: registeredActivity,
    session,
    evidenceEngine: new EvidenceEngine(),
    assessmentEngine: new AssessmentEngine(),
    progressEngine: new DefaultProgressEngine(),
  });

  assert.equal(result.feedback, "correct");
  assert.equal(result.interaction?.learnerId, session.learnerId);
  assert.equal(result.evidence?.learnerId, session.learnerId);
  assert.equal(result.assessment?.learnerId, session.learnerId);
  assert.equal(result.progress?.learnerId, session.learnerId);
  assert.equal(result.progress?.activityId, "SPEAK-SVO-01");
  assert.equal(result.progress?.skillId, "basic-svo-speaking");
  assert.equal(result.progress?.completed, true);
  assert.equal(result.progress?.score, 1);
  assert.doesNotMatch(JSON.stringify(result), /audio/i);
});

test("keeps Listening 01 completion separate from attempt feedback", () => {
  const legacyProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01"],
  };
  const restoredLegacy = restoreLearnerProgress(legacyProgress, "learner-1");
  assert.equal(restoredLegacy?.isListening01Complete, false);

  const completedProgress = completeListening01Progress(legacyProgress);
  let feedback = "correct";
  const restoredCompleted = restoreLearnerProgress(completedProgress, "learner-1");

  assert.equal(feedback, "correct");
  assert.equal(restoredCompleted?.isListening01Complete, true);

  const resetState = resetListening01Attempt(
    restoredCompleted?.isListening01Complete ?? false,
  );
  feedback = resetState.feedback;
  assert.equal(feedback, "idle");
  assert.equal(resetState.isListening01Complete, true);
});

test("reads the stable external user id from authenticated request headers", async () => {
  const authSource = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  const constantsStart = authSource.indexOf("const USER_ID_HEADER");
  const getUserEnd = authSource.indexOf("export async function requireChatGPTUser");
  const decoderStart = authSource.indexOf("function safeDecodeURIComponent");
  assert.ok(constantsStart >= 0);
  assert.ok(getUserEnd > constantsStart);
  assert.ok(decoderStart > getUserEnd);

  const getUserSource = `${authSource.slice(constantsStart, getUserEnd)}\n${authSource.slice(decoderStart)}`
    .replace("export async function getChatGPTUser(): Promise<ChatGPTUser | null>", "async function getChatGPTUser()")
    .replace("function safeDecodeURIComponent(value: string): string | null", "function safeDecodeURIComponent(value)");
  const requestHeaders = new Headers({
    "oai-authenticated-user-id": "external-user-1",
    "oai-authenticated-user-email": "returning@example.com",
  });
  const user = await runInNewContext(`${getUserSource}; getChatGPTUser();`, {
    headers: async () => requestHeaders,
  });

  assert.equal(user?.userId, "external-user-1");
});

test("resolves the existing learnerId for an identified returning user", async () => {
  const learnerId = await resolveLearnerId(
    { userId: "external-user-1" },
    async (externalUserId) => externalUserId === "external-user-1"
      ? "learner-1"
      : null,
  );

  assert.equal(learnerId, "learner-1");
});

test("resolves the active learner through the identified external user", async () => {
  const resolvedExternalUserIds = [];
  const learnerId = await getActiveLearnerId(
    { userId: "external-user-1" },
    async (externalUserId) => {
      resolvedExternalUserIds.push(externalUserId);
      return "learner-1";
    },
  );

  assert.equal(learnerId, "learner-1");
  assert.deepEqual(resolvedExternalUserIds, ["external-user-1"]);
});

test("obtains the external identity before resolving the active learner", async () => {
  const identitySourceReads = [];
  const resolvedExternalUserIds = [];
  const learnerId = await getActiveLearnerId(
    async () => {
      identitySourceReads.push("read");
      return { userId: "external-user-1" };
    },
    async (externalUserId) => {
      resolvedExternalUserIds.push(externalUserId);
      return externalUserId === "external-user-1" ? "learner-1" : null;
    },
  );

  assert.deepEqual(identitySourceReads, ["read"]);
  assert.deepEqual(resolvedExternalUserIds, ["external-user-1"]);
  assert.equal(learnerId, "learner-1");
});

test("resolves the configured learner association for a known external user", async () => {
  const findLearnerIdByExternalUserId =
    createConfiguredLearnerIdLookup({
      externalUserId: "external-user-1",
      learnerId: "learner-1",
    });

  const learnerId = await findLearnerIdByExternalUserId("external-user-1");

  assert.equal(learnerId, "learner-1");
});

test("does not resolve the configured learner association for a different external user", async () => {
  const findLearnerIdByExternalUserId =
    createConfiguredLearnerIdLookup({
      externalUserId: "external-user-1",
      learnerId: "learner-1",
    });

  const learnerId = await findLearnerIdByExternalUserId("external-user-2");

  assert.equal(learnerId, null);
});

test("restores separate persisted SEAL progress for different learners", () => {
  const learnerAProgressRecords = [{
    recordId: "progress-a-1",
    learnerId: "learner-a",
    activityId: "SVO-01",
    skillId: "basic-svo-construction",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-08T10:00:00.000Z",
  }];
  const learnerBProgressRecords = [{
    recordId: "progress-b-1",
    learnerId: "learner-b",
    activityId: "SVO-02",
    skillId: "basic-svo-construction",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 15,
    recordedAt: "2026-09-08T10:05:00.000Z",
  }];

  const restoredLearnerA = restoreLearnerProgress({
    learnerId: "learner-a",
    completedActivityIds: ["SVO-01"],
    progressRecords: learnerAProgressRecords,
  }, "learner-a");
  const restoredLearnerB = restoreLearnerProgress({
    learnerId: "learner-b",
    completedActivityIds: ["SVO-01", "SVO-02"],
    progressRecords: learnerBProgressRecords,
  }, "learner-b");

  assert.deepEqual(restoredLearnerA?.progressRecords.map((record) => ({
    ...record,
    recordedAt: record.recordedAt.toISOString(),
  })), learnerAProgressRecords);
  assert.deepEqual(restoredLearnerB?.progressRecords.map((record) => ({
    ...record,
    recordedAt: record.recordedAt.toISOString(),
  })), learnerBProgressRecords);
});

test("restores one learner's snapshot in another browser without sharing local storage", async () => {
  const learnerAProgressRecord = {
    recordId: "progress-a-1",
    learnerId: "learner-a",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-13T10:00:00.000Z",
  };
  const learnerASnapshot = {
    learnerId: "learner-a",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [learnerAProgressRecord],
  };
  const browserOneStorage = new Map();
  const browserTwoStorage = new Map();
  const sharedSnapshots = new Map();
  const database = {
    prepare: () => ({
      bind: (learnerId, snapshot) => ({
        first: async () => {
          const storedSnapshot = sharedSnapshots.get(learnerId);
          return storedSnapshot ? { snapshot: storedSnapshot } : null;
        },
        run: async () => {
          sharedSnapshots.set(learnerId, snapshot);
        },
      }),
    }),
  };
  const browserOnePersistence = createD1LearnerProgressPersistence(database);
  const browserTwoPersistence = createD1LearnerProgressPersistence(database);

  await persistLearnerProgress(browserOnePersistence, learnerASnapshot);

  assert.equal(browserOneStorage.size, 0);
  assert.equal(browserTwoStorage.size, 0);
  const restoredLearnerA = await loadLearnerProgress(
    browserTwoPersistence,
    "learner-a",
  );
  const restoredLearnerB = await loadLearnerProgress(
    browserTwoPersistence,
    "learner-b",
  );

  assert.equal(restoredLearnerB, null);
  assert.ok(restoredLearnerA);
  assert.deepEqual(restoredLearnerA.completedActivityIds, ["SVO-01"]);
  assert.equal(restoredLearnerA.isListening01Complete, true);
  assert.deepEqual(restoredLearnerA.progressRecords.map((record) => ({
    ...record,
    recordedAt: record.recordedAt.toISOString(),
  })), [learnerAProgressRecord]);
});

test("restores progress for the active learner after another learner used the same browser", async () => {
  const storedProgressByKey = new Map([
    ["spread11:learner-a:svo-progress", JSON.stringify({
      learnerId: "learner-a",
      completedActivityIds: ["SVO-01"],
    })],
    ["spread11:learner-b:svo-progress", JSON.stringify({
      learnerId: "learner-b",
      completedActivityIds: ["SVO-01", "SVO-02"],
    })],
  ]);
  const { completion, renderForLearner, restoredLearnerIds } =
    await createLearnerRestoreHarness(storedProgressByKey);

  await renderForLearner("learner-a");
  assert.equal(completion.isSvo02Complete, false);
  await renderForLearner("learner-b");
  assert.equal(completion.isSvo02Complete, true);
  await renderForLearner("learner-a");
  assert.equal(completion.isSvo02Complete, false);
  assert.deepEqual(restoredLearnerIds, ["learner-a", "learner-b", "learner-a"]);
});

test("does not retain another learner's progress when the active learner has no snapshot", async () => {
  const storedProgressByKey = new Map([
    ["spread11:learner-a:svo-progress", JSON.stringify({
      learnerId: "learner-a",
      completedActivityIds: ["SVO-01", "SVO-02"],
    })],
  ]);
  const { completion, renderForLearner } =
    await createLearnerRestoreHarness(storedProgressByKey);

  await renderForLearner("learner-a");
  assert.equal(completion.isSvo02Complete, true);
  await renderForLearner("learner-b");
  assert.equal(completion.isSvo02Complete, false);
});

test("does not retain another learner's progress when the active learner snapshot belongs to someone else", async () => {
  const storedProgressByKey = new Map([
    ["spread11:learner-a:svo-progress", JSON.stringify({
      learnerId: "learner-a",
      completedActivityIds: ["SVO-01", "SVO-02"],
    })],
    ["spread11:learner-b:svo-progress", JSON.stringify({
      learnerId: "learner-a",
      completedActivityIds: ["SVO-01", "SVO-02"],
    })],
  ]);
  const { completion, renderForLearner } =
    await createLearnerRestoreHarness(storedProgressByKey);

  await renderForLearner("learner-a");
  assert.equal(completion.isSvo02Complete, true);
  await renderForLearner("learner-b");
  assert.equal(completion.isSvo02Complete, false);
});

test("does not retain another learner's progress when the active learner snapshot is invalid", async () => {
  const storedProgressByKey = new Map([
    ["spread11:learner-a:svo-progress", JSON.stringify({
      learnerId: "learner-a",
      completedActivityIds: ["SVO-01", "SVO-02"],
    })],
    ["spread11:learner-b:svo-progress", "{invalid-json"],
  ]);
  const { completion, renderForLearner } =
    await createLearnerRestoreHarness(storedProgressByKey);

  await renderForLearner("learner-a");
  assert.equal(completion.isSvo02Complete, true);
  await renderForLearner("learner-b");
  assert.equal(completion.isSvo02Complete, false);
});

test("restores persisted learner progress as SEAL ProgressRecords", () => {
  const recordedAt = "2026-09-08T10:00:00.000Z";
  const restoredProgress = restoreLearnerProgress({
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01"],
    progressRecords: [{
      recordId: "progress-1",
      learnerId: "learner-1",
      activityId: "SVO-01",
      skillId: "basic-svo-construction",
      completed: true,
      score: 1,
      attemptNumber: 1,
      timeSpentSeconds: 12,
      recordedAt,
    }],
  }, "learner-1");

  assert.ok(restoredProgress);
  assert.ok(restoredProgress.progressRecords[0].recordedAt instanceof Date);
  assert.equal(restoredProgress.progressRecords[0].recordedAt.toISOString(), recordedAt);
});

test("adds assessed SEAL progress to the learner snapshot", async () => {
  const activityEngine = new ActivityEngine();
  activityEngine.register(listening01Activity);
  const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);
  const createdSession = await sessionEngine.createSession({
    learnerId: "learner-1",
    activityId: listening01Activity.id,
  });
  const session = await sessionEngine.startSession(createdSession.sessionId);
  const result = await checkListening01Answer({
    selectedAnswer: listening01Activity.expectedUnits[0],
    activity: listening01Activity,
    session,
    evidenceEngine: new EvidenceEngine(),
    assessmentEngine: new AssessmentEngine(),
    progressEngine: new DefaultProgressEngine(),
    sessionEngine,
  });
  assert.ok(result.progress);

  const completedProgress = completeListening01Progress({
    learnerId: session.learnerId,
    completedActivityIds: ["SVO-01"],
    progressRecords: [],
  }, result.progress);

  assert.deepEqual(completedProgress.progressRecords, [{
    ...result.progress,
    recordedAt: result.progress.recordedAt.toISOString(),
  }]);
});

test("does not add assessed progress belonging to another learner", () => {
  const completedProgress = completeListening01Progress({
    learnerId: "learner-a",
    completedActivityIds: ["SVO-01"],
    progressRecords: [],
  }, {
    recordId: "progress-b-1",
    learnerId: "learner-b",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: new Date("2026-09-08T10:00:00.000Z"),
  });

  assert.deepEqual(completedProgress.progressRecords, []);
});

test("passes assessed Listening 01 progress to the persisted learner snapshot", async () => {
  const pageSource = await readFile(new URL("../app/learner-journey.tsx", import.meta.url), "utf8");
  const handlerStart = pageSource.indexOf("async function checkListeningChoice()");
  const handlerEnd = pageSource.indexOf("async function handleListening02Answer()", handlerStart);
  assert.ok(handlerStart >= 0);
  assert.ok(handlerEnd > handlerStart);

  const handlerSource = pageSource.slice(handlerStart, handlerEnd);
  assert.match(
    handlerSource,
    /completeListening01Progress\(\{[\s\S]*?\}\s*,\s*result\.progress\s*\)\)/,
  );
});

test("preserves persisted SEAL progress when later UI completion is saved", async () => {
  const progressRecord = {
    recordId: "progress-1",
    learnerId: "learner-1",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-08T10:00:00.000Z",
  };
  const storedProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [progressRecord],
  };
  const nextProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
  };
  const persistedProgress = await persistProgressInMemory(storedProgress, nextProgress);

  assert.deepEqual(persistedProgress, {
    ...nextProgress,
    progressRecords: [progressRecord],
  });
});

test("appends new assessed SEAL progress without replacing the learner history", async () => {
  const listening01Progress = {
    recordId: "progress-1",
    learnerId: "learner-1",
    activityId: "LISTEN-SVO-01",
    skillId: "listening-svo-recognition",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 12,
    recordedAt: "2026-09-08T10:00:00.000Z",
  };
  const listening02Progress = {
    recordId: "progress-2",
    learnerId: "learner-1",
    activityId: "LISTEN-SVO-02",
    skillId: "listening-svo-construction",
    completed: true,
    score: 1,
    attemptNumber: 1,
    timeSpentSeconds: 18,
    recordedAt: "2026-09-08T10:05:00.000Z",
  };
  const storedProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
    progressRecords: [listening01Progress],
  };
  const nextProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02"],
    completedListeningActivityIds: ["LISTEN-SVO-01", "LISTEN-SVO-02"],
    progressRecords: [listening02Progress],
  };
  const persistedProgress = await persistProgressInMemory(storedProgress, nextProgress);

  assert.deepEqual(persistedProgress, {
    ...nextProgress,
    progressRecords: [listening01Progress, listening02Progress],
  });
});

test("persists progress under the learner's own storage key", async () => {
  const nextProgress = {
    learnerId: "learner-b",
    completedActivityIds: ["SVO-01"],
  };
  let persistedKey = null;

  await persistProgressInMemory(undefined, nextProgress, {
    onSetItem: (key) => {
      persistedKey = key;
    },
  });

  assert.equal(persistedKey, "spread11:learner-b:svo-progress");
});

test("does not persist progress records belonging to another learner", async () => {
  const persistedProgress = await persistProgressInMemory(undefined, {
    learnerId: "learner-a",
    completedActivityIds: ["SVO-01"],
    progressRecords: [{
      recordId: "progress-b-1",
      learnerId: "learner-b",
      activityId: "LISTEN-SVO-01",
      skillId: "listening-svo-recognition",
      completed: true,
      score: 1,
      attemptNumber: 1,
      timeSpentSeconds: 12,
      recordedAt: "2026-09-08T10:00:00.000Z",
    }],
  });

  assert.deepEqual(persistedProgress.progressRecords, []);
});

test("keeps Listening 02 completion separate from attempt feedback", () => {
  const oldestProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02"],
  };
  const restoredOldest = restoreLearnerProgress(oldestProgress, "learner-1");
  assert.equal(restoredOldest?.isListening02Complete, false);

  const legacyProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02"],
    completedListeningActivityIds: ["LISTEN-SVO-01"],
  };
  const restoredLegacy = restoreLearnerProgress(legacyProgress, "learner-1");
  assert.equal(restoredLegacy?.isListening02Complete, false);

  const completedProgress = completeListening02Progress(legacyProgress);
  let feedback = "correct";
  const restoredCompleted = restoreLearnerProgress(completedProgress, "learner-1");

  assert.equal(feedback, "correct");
  assert.equal(restoredCompleted?.isListening02Complete, true);

  const resetState = resetListening02Attempt(
    restoredCompleted?.isListening02Complete ?? false,
  );
  feedback = resetState.feedback;
  assert.equal(feedback, "idle");
  assert.equal(resetState.isListening02Complete, true);
});

test("keeps Listening 03 completion separate from attempt feedback", () => {
  const oldestProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03"],
  };
  const restoredOldest = restoreLearnerProgress(oldestProgress, "learner-1");
  assert.equal(restoredOldest?.isListening03Complete, false);

  const legacyProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03"],
    completedListeningActivityIds: ["LISTEN-SVO-01", "LISTEN-SVO-02"],
  };
  const restoredLegacy = restoreLearnerProgress(legacyProgress, "learner-1");
  assert.equal(restoredLegacy?.isListening03Complete, false);

  const completedProgress = completeListening03Progress(legacyProgress);
  let feedback = "correct";
  const restoredCompleted = restoreLearnerProgress(completedProgress, "learner-1");

  assert.equal(feedback, "correct");
  assert.equal(restoredCompleted?.isListening03Complete, true);

  const resetState = resetListening03Attempt(
    restoredCompleted?.isListening03Complete ?? false,
  );
  feedback = resetState.feedback;
  assert.equal(feedback, "idle");
  assert.equal(resetState.isListening03Complete, true);
});

test("keeps Listening 04 completion separate from attempt feedback", () => {
  const oldestProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04"],
  };
  const restoredOldest = restoreLearnerProgress(oldestProgress, "learner-1");
  assert.equal(restoredOldest?.isListening04Complete, false);

  const legacyProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04"],
    completedListeningActivityIds: [
      "LISTEN-SVO-01",
      "LISTEN-SVO-02",
      "LISTEN-SVO-03",
    ],
  };
  const restoredLegacy = restoreLearnerProgress(legacyProgress, "learner-1");
  assert.equal(restoredLegacy?.isListening04Complete, false);

  const completedProgress = completeListening04Progress(legacyProgress);
  let feedback = "correct";
  const restoredCompleted = restoreLearnerProgress(completedProgress, "learner-1");

  assert.equal(feedback, "correct");
  assert.equal(restoredCompleted?.isListening04Complete, true);

  const resetState = resetListening04Attempt(
    restoredCompleted?.isListening04Complete ?? false,
  );
  feedback = resetState.feedback;
  assert.equal(feedback, "idle");
  assert.equal(resetState.isListening04Complete, true);
});

test("keeps Listening 05 completion separate from attempt feedback", () => {
  const oldestProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04", "SVO-05"],
  };
  const restoredOldest = restoreLearnerProgress(oldestProgress, "learner-1");
  assert.equal(restoredOldest?.isListening05Complete, false);

  const legacyProgress = {
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04", "SVO-05"],
    completedListeningActivityIds: [
      "LISTEN-SVO-01",
      "LISTEN-SVO-02",
      "LISTEN-SVO-03",
      "LISTEN-SVO-04",
    ],
  };
  const restoredLegacy = restoreLearnerProgress(legacyProgress, "learner-1");
  assert.equal(restoredLegacy?.isListening05Complete, false);

  const completedProgress = completeListening05Progress(legacyProgress);
  let feedback = "correct";
  const restoredCompleted = restoreLearnerProgress(completedProgress, "learner-1");

  assert.equal(feedback, "correct");
  assert.equal(restoredCompleted?.isListening05Complete, true);

  const resetState = resetListening05Attempt(
    restoredCompleted?.isListening05Complete ?? false,
  );
  feedback = resetState.feedback;
  assert.equal(feedback, "idle");
  assert.equal(resetState.isListening05Complete, true);
});

test("requires both SVO-01 and Listening 01 to unlock SVO-02", () => {
  assert.equal(canUnlockSvo02({
    isSvo01Complete: true,
    isListening01Complete: false,
  }), false);
  assert.equal(canUnlockSvo02({
    isSvo01Complete: true,
    isListening01Complete: true,
  }), true);
  assert.equal(canUnlockSvo02({
    isSvo01Complete: false,
    isListening01Complete: true,
  }), false);
});

test("requires both SVO-02 and Listening 02 to unlock SVO-03", () => {
  assert.equal(canUnlockSvo03({
    isSvo02Complete: true,
    isListening02Complete: false,
  }), false);
  assert.equal(canUnlockSvo03({
    isSvo02Complete: true,
    isListening02Complete: true,
  }), true);
  assert.equal(canUnlockSvo03({
    isSvo02Complete: false,
    isListening02Complete: true,
  }), false);
});

test("requires both SVO-03 and Listening 03 to unlock SVO-04", () => {
  assert.equal(canUnlockSvo04({
    isSvo03Complete: true,
    isListening03Complete: false,
  }), false);
  assert.equal(canUnlockSvo04({
    isSvo03Complete: true,
    isListening03Complete: true,
  }), true);
  assert.equal(canUnlockSvo04({
    isSvo03Complete: false,
    isListening03Complete: true,
  }), false);
});

test("requires both SVO-04 and Listening 04 to unlock SVO-05", () => {
  assert.equal(canUnlockSvo05({
    isSvo04Complete: true,
    isListening04Complete: false,
  }), false);
  assert.equal(canUnlockSvo05({
    isSvo04Complete: true,
    isListening04Complete: true,
  }), true);
  assert.equal(canUnlockSvo05({
    isSvo04Complete: false,
    isListening04Complete: true,
  }), false);
});

test("requires SVO-01 to unlock Listening 01", () => {
  assert.equal(canUnlockListening01({ isSvo01Complete: false }), false);
  assert.equal(canUnlockListening01({ isSvo01Complete: true }), true);
});

test("requires SVO-02 to unlock Listening 02 independently from attempt feedback", () => {
  assert.equal(canUnlockListening02({
    isSvo02Complete: false,
  }), false);
  assert.equal(canUnlockListening02({
    isSvo02Complete: true,
  }), true);
});

test("requires SVO-03 to unlock Listening 03 independently from attempt feedback", () => {
  assert.equal(canUnlockListening03({
    isSvo03Complete: false,
  }), false);
  assert.equal(canUnlockListening03({
    isSvo03Complete: true,
  }), true);
});

test("requires SVO-04 to unlock Listening 04 independently from attempt feedback", () => {
  assert.equal(canUnlockListening04({
    isSvo04Complete: false,
  }), false);
  assert.equal(canUnlockListening04({
    isSvo04Complete: true,
  }), true);

  const restoredProgress = restoreLearnerProgress({
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04"],
    completedListeningActivityIds: [
      "LISTEN-SVO-01",
      "LISTEN-SVO-02",
      "LISTEN-SVO-03",
    ],
  }, "learner-1");
  const listening03Feedback = "idle";

  assert.equal(listening03Feedback, "idle");
  assert.equal(canUnlockListening04({
    isSvo04Complete: restoredProgress?.completedActivityIds.includes("SVO-04") ?? false,
  }), true);
});

test("requires SVO-05 to unlock Listening 05 independently from attempt feedback", () => {
  assert.equal(canUnlockListening05({
    isSvo05Complete: false,
  }), false);
  assert.equal(canUnlockListening05({
    isSvo05Complete: true,
  }), true);

  const restoredProgress = restoreLearnerProgress({
    learnerId: "learner-1",
    completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04", "SVO-05"],
    completedListeningActivityIds: [
      "LISTEN-SVO-01",
      "LISTEN-SVO-02",
      "LISTEN-SVO-03",
      "LISTEN-SVO-04",
    ],
  }, "learner-1");
  const listening04Feedback = "idle";

  assert.equal(listening04Feedback, "idle");
  assert.equal(canUnlockListening05({
    isSvo05Complete: restoredProgress?.completedActivityIds.includes("SVO-05") ?? false,
  }), true);
});

test("assembles Listening 02 tiles and submits through the application pipeline", async () => {
  const activityEngine = new ActivityEngine();
  const activity = {
    id: "LISTEN-SVO-02-INTEGRATION",
    title: "Rebuild the sentence you hear",
    type: "sentence-construction",
    level: "sentence",
    pattern: "SVO",
    availableUnits: listening02InitialTiles.map((tile) => tile.label),
    expectedUnits: ["Maya", "writes", "letters"],
    skillIds: ["listening-svo-reconstruction-integration"],
  };
  const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);
  const session = await startListening02Session({
    learnerId: "learner-1",
    activity,
    activityEngine,
    sessionEngine,
  });
  const evidenceEngine = new EvidenceEngine();
  const assessmentEngine = new AssessmentEngine();
  const progressEngine = new DefaultProgressEngine();

  const findTile = (label) => {
    const tile = listening02InitialTiles.find((candidate) => candidate.label === label);
    assert.ok(tile, `Expected the tile bank to contain ${label}`);
    return tile;
  };
  const assemble = (labels) => labels.reduce(
    (answer, label) => addListening02Tile(answer, findTile(label)),
    [],
  );

  const incorrectResult = await checkListening02Answer({
    answer: assemble(["letters", "Maya", "writes"]),
    activity,
    session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });
  const correctResult = await checkListening02Answer({
    answer: assemble(["Maya", "writes", "letters"]),
    activity,
    session: incorrectResult.session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });

  assert.equal(session.activityId, activity.id);
  assert.equal(incorrectResult.session?.status, "active");
  assert.equal(correctResult.session?.status, "completed");
  assert.equal(correctResult.interaction?.sessionId, session.sessionId);
  assert.equal(incorrectResult.interaction?.sessionId, session.sessionId);
  assert.equal(correctResult.progress?.activityId, activity.id);
  assert.equal(correctResult.progress?.skillId, activity.skillIds[0]);
  assert.equal(correctResult.feedback, "correct");
  assert.deepEqual(correctResult.interaction?.payload.submittedUnits, ["Maya", "writes", "letters"]);
  assert.deepEqual(correctResult.evidence?.data.submittedUnits, ["Maya", "writes", "letters"]);
  assert.equal(correctResult.assessment?.correct, true);
  assert.equal(correctResult.progress?.completed, true);
  assert.equal(correctResult.progress?.score, 1);
  assert.equal(correctResult.progress?.attemptNumber, 2);

  assert.equal(incorrectResult.feedback, "incorrect");
  assert.deepEqual(incorrectResult.interaction?.payload.submittedUnits, ["letters", "Maya", "writes"]);
  assert.deepEqual(incorrectResult.evidence?.data.submittedUnits, ["letters", "Maya", "writes"]);
  assert.equal(incorrectResult.assessment?.correct, false);
  assert.equal(incorrectResult.progress?.completed, false);
  assert.equal(incorrectResult.progress?.score, 0);
  assert.equal(incorrectResult.progress?.attemptNumber, 1);
});

test("limits Listening 03 reconstruction to the expected number of units", () => {
  const findTile = (label) => {
    const tile = listening03InitialTiles.find((candidate) => candidate.label === label);
    assert.ok(tile, `Expected the Listening 03 tile bank to contain ${label}`);
    return tile;
  };
  const partialAnswer = [findTile("Daniel")];
  const answerWithSpace = addListening03Tile(
    partialAnswer,
    findTile("reads"),
    listening03Activity.expectedUnits.length,
  );
  assert.deepEqual(answerWithSpace, [findTile("Daniel"), findTile("reads")]);

  const answer = [findTile("Daniel"), findTile("reads"), findTile("books")];

  const result = addListening03Tile(
    answer,
    findTile("writes"),
    listening03Activity.expectedUnits.length,
  );

  assert.deepEqual(result, answer);
});

test("assesses Listening 03 reconstructions with distractors in one session", async () => {
  const activityEngine = new ActivityEngine();
  const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);
  const session = await startListening03Session({
    learnerId: "learner-1",
    activity: listening03Activity,
    activityEngine,
    sessionEngine,
  });
  const evidenceEngine = new EvidenceEngine();
  const assessmentEngine = new AssessmentEngine();
  const progressEngine = new DefaultProgressEngine();
  const findTile = (label) => {
    const tile = listening03InitialTiles.find((candidate) => candidate.label === label);
    assert.ok(tile, `Expected the Listening 03 tile bank to contain ${label}`);
    return tile;
  };

  const incorrectResult = await checkListening03Answer({
    answer: [findTile("Daniel"), findTile("writes"), findTile("books")],
    activity: listening03Activity,
    session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });
  const correctResult = await checkListening03Answer({
    answer: [findTile("Daniel"), findTile("reads"), findTile("books")],
    activity: listening03Activity,
    session: incorrectResult.session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });

  assert.equal(incorrectResult.feedback, "incorrect");
  assert.deepEqual(incorrectResult.evidence?.data.submittedUnits, ["Daniel", "writes", "books"]);
  assert.equal(incorrectResult.assessment?.correct, false);
  assert.equal(incorrectResult.session.status, "active");
  assert.equal(incorrectResult.interaction?.sessionId, session.sessionId);
  assert.equal(incorrectResult.interaction?.learnerId, session.learnerId);
  assert.equal(incorrectResult.progress?.attemptNumber, 1);
  assert.equal(incorrectResult.progress?.activityId, listening03Activity.id);
  assert.equal(incorrectResult.progress?.skillId, listening03Activity.skillIds[0]);
  assert.equal(correctResult.feedback, "correct");
  assert.equal(correctResult.assessment?.correct, true);
  assert.equal(correctResult.session.status, "completed");
  assert.equal(correctResult.interaction?.sessionId, session.sessionId);
  assert.equal(correctResult.interaction?.learnerId, session.learnerId);
  assert.equal(correctResult.progress?.attemptNumber, 2);
});

test("serializes Listening 04 role slots independently from their visual order", () => {
  const slots = {
    Verb: { id: "listening-04-plays", label: "plays", role: "Verb" },
    Object: { id: "listening-04-tennis", label: "tennis", role: "Object" },
    Subject: { id: "listening-04-laura", label: "Laura", role: "Subject" },
  };

  assert.deepEqual(
    serializeListening04Slots(slots),
    ["Laura", "plays", "tennis"],
  );
});

test("assesses Listening 04 role mappings in canonical SVO order", async () => {
  const activityEngine = new ActivityEngine();
  const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);
  const session = await startListening04Session({
    learnerId: "learner-1",
    activity: listening04Activity,
    activityEngine,
    sessionEngine,
  });
  assert.equal(session.activityId, listening04Activity.id);
  assert.equal(session.learnerId, "learner-1");
  assert.equal(session.status, "active");
  assert.equal(
    activityEngine.get(listening04Activity.id)?.id,
    listening04Activity.id,
  );
  const evidenceEngine = new EvidenceEngine();
  const assessmentEngine = new AssessmentEngine();
  const progressEngine = new DefaultProgressEngine();
  const findTile = (label) => {
    const tile = listening04InitialTiles.find((candidate) => candidate.label === label);
    assert.ok(tile, `Expected the Listening 04 tile bank to contain ${label}`);
    return tile;
  };

  const incorrectResult = await checkListening04Answer({
    slots: {
      Verb: findTile("tennis"),
      Object: findTile("plays"),
      Subject: findTile("Laura"),
    },
    activity: listening04Activity,
    session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });

  assert.equal(incorrectResult.session?.status, "active");
  assert.equal(incorrectResult.interaction.sessionId, session.sessionId);
  assert.equal(incorrectResult.feedback, "incorrect");

  const correctResult = await checkListening04Answer({
    slots: {
      Verb: findTile("plays"),
      Object: findTile("tennis"),
      Subject: findTile("Laura"),
    },
    activity: listening04Activity,
    session: incorrectResult.session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });

  assert.deepEqual(
    incorrectResult.interaction.payload.submittedUnits,
    ["Laura", "tennis", "plays"],
  );
  assert.equal(incorrectResult.assessment.correct, false);
  assert.equal(incorrectResult.progress?.attemptNumber, 1);
  assert.equal(incorrectResult.progress?.activityId, listening04Activity.id);
  assert.equal(incorrectResult.progress?.skillId, listening04Activity.skillIds[0]);
  assert.equal(incorrectResult.progress?.completed, false);
  assert.deepEqual(
    correctResult.interaction.payload.submittedUnits,
    ["Laura", "plays", "tennis"],
  );
  assert.deepEqual(
    correctResult.evidence.data.submittedUnits,
    ["Laura", "plays", "tennis"],
  );
  assert.equal(correctResult.assessment.correct, true);
  assert.equal(correctResult.progress?.attemptNumber, 2);
  assert.equal(correctResult.progress?.activityId, listening04Activity.id);
  assert.equal(correctResult.progress?.skillId, listening04Activity.skillIds[0]);
  assert.equal(correctResult.progress?.completed, true);
  assert.equal(correctResult.session.status, "completed");
  assert.equal(correctResult.interaction.sessionId, session.sessionId);
  assert.equal(correctResult.feedback, "correct");
});

test("reuses the role-mapping pipeline for Listening 05 transfer", async () => {
  assert.equal(
    listening05Prompt,
    `${listening05Activity.expectedUnits.join(" ")}.`,
  );

  const activityEngine = new ActivityEngine();
  const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);
  const session = await startListening05Session({
    learnerId: "learner-1",
    activity: listening05Activity,
    activityEngine,
    sessionEngine,
  });
  const evidenceEngine = new EvidenceEngine();
  const assessmentEngine = new AssessmentEngine();
  const progressEngine = new DefaultProgressEngine();
  const findTile = (label) => {
    const tile = listening05InitialTiles.find((candidate) => candidate.label === label);
    assert.ok(tile, `Expected the Listening 05 tile bank to contain ${label}`);
    return tile;
  };

  const incorrectResult = await checkListening05Answer({
    slots: {
      Verb: findTile("plays"),
      Object: findTile("movies"),
      Subject: findTile("Carlos"),
    },
    activity: listening05Activity,
    session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });
  const correctResult = await checkListening05Answer({
    slots: {
      Verb: findTile("watches"),
      Object: findTile("movies"),
      Subject: findTile("Carlos"),
    },
    activity: listening05Activity,
    session: incorrectResult.session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
    sessionEngine,
  });
  const restarted = await restartListening05({
    completedSession: correctResult.session,
    activity: listening05Activity,
    activityEngine,
    sessionEngine,
  });

  assert.equal(incorrectResult.assessment.correct, false);
  assert.equal(incorrectResult.session.status, "active");
  assert.equal(incorrectResult.progress.activityId, listening05Activity.id);
  assert.equal(incorrectResult.progress.skillId, listening04Activity.skillIds[0]);
  assert.deepEqual(
    correctResult.interaction.payload.submittedUnits,
    ["Carlos", "watches", "movies"],
  );
  assert.equal(correctResult.assessment.correct, true);
  assert.equal(correctResult.progress.activityId, listening05Activity.id);
  assert.equal(correctResult.progress.skillId, listening04Activity.skillIds[0]);
  assert.equal(correctResult.session.status, "completed");
  assert.equal(restarted.session.status, "active");
  assert.notEqual(restarted.session.sessionId, correctResult.session.sessionId);
  assert.equal(restarted.session.activityId, listening05Activity.id);
  assert.equal(restarted.session.learnerId, correctResult.session.learnerId);
  assert.equal(restarted.feedback, "idle");
  assert.deepEqual(restarted.slots, {});
  assert.deepEqual(restarted.availableTiles, listening05InitialTiles);
});
