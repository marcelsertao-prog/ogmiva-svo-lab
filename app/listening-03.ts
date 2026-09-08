import type { ActivityEngine, LearningActivity } from "@seal-sdk/activity";
import type { AssessmentEngine, SubmitAnswerAssessment } from "@seal-sdk/assessment";
import type { EvidenceEngine, SubmitAnswerEvidence } from "@seal-sdk/evidence";
import {
  createSubmitAnswerInteraction,
  type SubmitAnswerInteraction,
} from "@seal-sdk/interaction";
import type { ProgressEngine, ProgressRecord } from "@seal-sdk/progress";
import type { SessionEngine, SessionState } from "@seal-sdk/session";

export type Listening03Tile = {
  id: string;
  label: string;
  role: "Subject" | "Verb" | "Object";
};

export const listening03InitialTiles: Listening03Tile[] = [
  { id: "listening-03-books", label: "books", role: "Object" },
  { id: "listening-03-writes", label: "writes", role: "Verb" },
  { id: "listening-03-daniel", label: "Daniel", role: "Subject" },
  { id: "listening-03-music", label: "music", role: "Object" },
  { id: "listening-03-reads", label: "reads", role: "Verb" },
];
export const listening03Prompt = "Daniel reads books.";

export const listening03Activity: LearningActivity = {
  id: "LISTEN-SVO-03",
  title: "Rebuild the sentence with distractors",
  type: "sentence-construction",
  level: "sentence",
  pattern: "SVO",
  availableUnits: listening03InitialTiles.map((tile) => tile.label),
  expectedUnits: ["Daniel", "reads", "books"],
  skillIds: ["basic-svo-listening"],
};

export function addListening03Tile(
  answer: Listening03Tile[],
  tile: Listening03Tile,
  maximumUnits: number,
): Listening03Tile[] {
  if (answer.length >= maximumUnits) return answer;

  return [...answer, tile];
}

export async function startListening03Session({
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

type Listening03SubmissionInput = {
  answer: Listening03Tile[];
  activity: LearningActivity;
  session: SessionState;
  evidenceEngine: EvidenceEngine;
  assessmentEngine: AssessmentEngine;
  progressEngine: ProgressEngine;
  sessionEngine: SessionEngine;
};

type Listening03SubmissionResult = {
  feedback: "incomplete" | "incorrect" | "correct";
  session: SessionState;
  interaction?: SubmitAnswerInteraction;
  evidence?: SubmitAnswerEvidence;
  assessment?: SubmitAnswerAssessment;
  progress?: ProgressRecord;
};

export async function checkListening03Answer({
  answer,
  activity,
  session,
  evidenceEngine,
  assessmentEngine,
  progressEngine,
  sessionEngine,
}: Listening03SubmissionInput): Promise<Listening03SubmissionResult> {
  if (answer.length !== activity.expectedUnits.length) {
    return { feedback: "incomplete", session };
  }

  const interaction = createSubmitAnswerInteraction({
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    submittedUnits: answer.map((tile) => tile.label),
  });
  const evidence = evidenceEngine.capture(interaction);
  const assessment = assessmentEngine.assess({
    evidence,
    expectedUnits: activity.expectedUnits,
  });
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
