import type { LearningActivity } from "@seal-sdk/activity";
import type { AssessmentEngine, SubmitAnswerAssessment } from "@seal-sdk/assessment";
import type { EvidenceEngine, SubmitAnswerEvidence } from "@seal-sdk/evidence";
import {
  createSubmitAnswerInteraction,
  type SubmitAnswerInteraction,
} from "@seal-sdk/interaction";
import type { ProgressEngine, ProgressRecord } from "@seal-sdk/progress";
import type { SessionEngine, SessionState } from "@seal-sdk/session";

export const listening01Activity: LearningActivity = {
  id: "LISTEN-SVO-01",
  title: "Identify the sentence you hear",
  type: "sentence-recognition",
  level: "sentence",
  pattern: "SVO",
  availableUnits: [
    "Anna likes music.",
    "Likes Anna music.",
    "Music Anna likes.",
  ],
  expectedUnits: ["Anna likes music."],
  skillIds: ["basic-svo-listening"],
};

type Listening01SubmissionInput = {
  selectedAnswer: string | null;
  activity: LearningActivity;
  session: SessionState;
  evidenceEngine: EvidenceEngine;
  assessmentEngine: AssessmentEngine;
  progressEngine: ProgressEngine;
  sessionEngine: SessionEngine;
};

type Listening01SubmissionResult = {
  feedback: "incomplete" | "incorrect" | "correct";
  session: SessionState;
  interaction?: SubmitAnswerInteraction;
  evidence?: SubmitAnswerEvidence;
  assessment?: SubmitAnswerAssessment;
  progress?: ProgressRecord;
};

export async function checkListening01Answer({
  selectedAnswer,
  activity,
  session,
  evidenceEngine,
  assessmentEngine,
  progressEngine,
  sessionEngine,
}: Listening01SubmissionInput): Promise<Listening01SubmissionResult> {
  if (!selectedAnswer) {
    return { feedback: "incomplete", session };
  }

  const interaction = createSubmitAnswerInteraction({
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    submittedUnits: [selectedAnswer],
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
