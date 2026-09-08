import type { ActivityEngine, LearningActivity } from "@seal-sdk/activity";
import type { AssessmentEngine, SubmitAnswerAssessment } from "@seal-sdk/assessment";
import type { EvidenceEngine, SubmitAnswerEvidence } from "@seal-sdk/evidence";
import {
  createSubmitAnswerInteraction,
  type SubmitAnswerInteraction,
} from "@seal-sdk/interaction";
import type { ProgressEngine, ProgressRecord } from "@seal-sdk/progress";
import type { SessionEngine, SessionState } from "@seal-sdk/session";

export type Listening04Role = "Subject" | "Verb" | "Object";

export type Listening04Tile = {
  id: string;
  label: string;
  role: Listening04Role;
};

export type Listening04Slots = Record<Listening04Role, Listening04Tile>;

export const listening04InitialTiles: Listening04Tile[] = [
  { id: "listening-04-tennis", label: "tennis", role: "Object" },
  { id: "listening-04-reads", label: "reads", role: "Verb" },
  { id: "listening-04-laura", label: "Laura", role: "Subject" },
  { id: "listening-04-music", label: "music", role: "Object" },
  { id: "listening-04-plays", label: "plays", role: "Verb" },
];

export const listening04Prompt = "Laura plays tennis.";

export const listening04Activity: LearningActivity = {
  id: "LISTEN-SVO-04",
  title: "Match the words you hear to their SVO roles",
  type: "sentence-construction",
  level: "sentence",
  pattern: "SVO",
  availableUnits: listening04InitialTiles.map((tile) => tile.label),
  expectedUnits: ["Laura", "plays", "tennis"],
  skillIds: ["basic-svo-listening-role-identification"],
};

export function serializeListening04Slots(slots: Listening04Slots): string[] {
  return [
    slots.Subject.label,
    slots.Verb.label,
    slots.Object.label,
  ];
}

export async function startListening04Session({
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

export async function checkListening04Answer({
  slots,
  activity,
  session,
  evidenceEngine,
  assessmentEngine,
  progressEngine,
  sessionEngine,
}: {
  slots: Listening04Slots;
  activity: LearningActivity;
  session: SessionState;
  evidenceEngine: EvidenceEngine;
  assessmentEngine: AssessmentEngine;
  progressEngine: ProgressEngine;
  sessionEngine: SessionEngine;
}): Promise<{
  feedback: "incorrect" | "correct";
  session: SessionState;
  interaction: SubmitAnswerInteraction;
  evidence: SubmitAnswerEvidence;
  assessment: SubmitAnswerAssessment;
  progress: ProgressRecord;
}> {
  const interaction = createSubmitAnswerInteraction({
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    submittedUnits: serializeListening04Slots(slots),
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
  const feedback = assessment.correct ? "correct" : "incorrect";

  return { feedback, session: updatedSession, interaction, evidence, assessment, progress };
}
