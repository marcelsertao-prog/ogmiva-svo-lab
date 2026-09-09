import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ActivityEngine } from "@seal-sdk/activity";
import { AssessmentEngine } from "@seal-sdk/assessment";
import { EventBus } from "@seal-sdk/events";
import { EvidenceEngine } from "@seal-sdk/evidence";
import { DefaultProgressEngine } from "@seal-sdk/progress";
import { DefaultSessionEngine } from "@seal-sdk/session";
import { checkListening01Answer } from "../app/listening-01.ts";
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

test("renders the initial SVO journey", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

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

test("styles current, complete, and locked states in the first paired stage", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /journey-stage--pilot\[data-stage-state="current"\]/);
  assert.match(css, /journey-stage--pilot\[data-stage-state="complete"\]/);
  assert.match(css, /paired-activity\[data-activity-state="locked"\]/);
});

test("marks Listening 05 as the end of the current journey", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

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

  assert.deepEqual(restoredLearnerA?.progressRecords, learnerAProgressRecords);
  assert.deepEqual(restoredLearnerB?.progressRecords, learnerBProgressRecords);
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
