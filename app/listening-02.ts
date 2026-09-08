import type { ActivityEngine, LearningActivity } from "@seal-sdk/activity";
import type { AssessmentEngine, SubmitAnswerAssessment } from "@seal-sdk/assessment";
import type { EvidenceEngine, SubmitAnswerEvidence } from "@seal-sdk/evidence";
import {
  createSubmitAnswerInteraction,
  type SubmitAnswerInteraction,
} from "@seal-sdk/interaction";
import type { ProgressEngine, ProgressRecord } from "@seal-sdk/progress";
import type { SessionEngine, SessionState } from "@seal-sdk/session";

export type Listening02Tile = {
  id: string;
  label: string;
  role: "Subject" | "Verb" | "Object";
};

export const listening02Prompt = "Maya writes letters.";
export const listening02ExpectedUnits = ["Maya", "writes", "letters"];
export const listening02InitialTiles: Listening02Tile[] = [
  { id: "listening-letters", label: "letters", role: "Object" },
  { id: "listening-maya", label: "Maya", role: "Subject" },
  { id: "listening-writes", label: "writes", role: "Verb" },
];
export const listening02Activity: LearningActivity = {
  id: "LISTEN-SVO-02",
  title: "Rebuild the sentence you hear",
  type: "sentence-construction",
  level: "sentence",
  pattern: "SVO",
  availableUnits: listening02InitialTiles.map((tile) => tile.label),
  expectedUnits: listening02ExpectedUnits,
  skillIds: ["basic-svo-listening"],
};

export function addListening02Tile(
  answer: Listening02Tile[],
  tile: Listening02Tile,
): Listening02Tile[] {
  return [...answer, tile];
}

export async function startListening02Session({
  learnerId,
  activity,
  activityEngine,
  sessionEngine,
}: {
  learnerId: string;
  activity: LearningActivity;
  activityEngine: ActivityEngine;
  sessionEngine: SessionEngine;
}): Promise<SessionState> {
  activityEngine.register(activity);
  const createdSession = await sessionEngine.createSession({
    learnerId,
    activityId: activity.id,
  });

  return sessionEngine.startSession(createdSession.sessionId);
}

type Listening02SubmissionInput = {
  answer: Listening02Tile[];
  activity: LearningActivity;
  session: SessionState;
  evidenceEngine: EvidenceEngine;
  assessmentEngine: AssessmentEngine;
  progressEngine: ProgressEngine;
  sessionEngine: SessionEngine;
};

type Listening02SubmissionResult = {
  feedback: "incomplete" | "incorrect" | "correct";
  session: SessionState;
  interaction?: SubmitAnswerInteraction;
  evidence?: SubmitAnswerEvidence;
  assessment?: SubmitAnswerAssessment;
  progress?: ProgressRecord;
};

export async function checkListening02Answer({
  answer,
  activity,
  session,
  evidenceEngine,
  assessmentEngine,
  progressEngine,
  sessionEngine,
}: Listening02SubmissionInput): Promise<Listening02SubmissionResult> {
  if (answer.length !== activity.expectedUnits.length) {
    return { feedback: "incomplete", session };
  }

  const interaction = createSubmitAnswerInteraction({
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    submittedUnits: answer.map((tile) => tile.label),
  });
  const evidence = evidenceEngine.capture(interaction);
  const assessment = assessmentEngine.assess({ evidence, expectedUnits: activity.expectedUnits });
  const progress = await progressEngine.recordAssessment({
    assessment,
    activityId: activity.id,
    skillId: activity.skillIds[0],
    timeSpentSeconds: 0,
  });
  const updatedSession = assessment.correct
    ? await sessionEngine.completeSession(session.sessionId)
    : session;

  return {
    feedback: assessment.correct ? "correct" : "incorrect",
    session: updatedSession,
    interaction,
    evidence,
    assessment,
    progress,
  };
}
