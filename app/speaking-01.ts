import type { LearningActivity } from "@seal-sdk/activity";
import type {
  AssessmentEngine,
  SubmitAnswerAssessment,
} from "@seal-sdk/assessment";
import type { EvidenceEngine, SubmitAnswerEvidence } from "@seal-sdk/evidence";
import {
  createSubmitAnswerInteraction,
  type SubmitAnswerInteraction,
} from "@seal-sdk/interaction";
import type { ProgressEngine, ProgressRecord } from "@seal-sdk/progress";
import type { SessionState } from "@seal-sdk/session";

export type SpeakingRecognitionResult = {
  recognizedText: string | null;
};

export type SpeakingRecognitionFailureCode =
  | "permission-denied"
  | "microphone-unavailable";

export class SpeakingRecognitionError extends Error {
  readonly code: SpeakingRecognitionFailureCode;

  constructor(code: SpeakingRecognitionFailureCode) {
    super(code);
    this.name = "SpeakingRecognitionError";
    this.code = code;
  }
}

export type Speaking01Recognizer = (input: {
  learnerId: string;
}) => Promise<SpeakingRecognitionResult>;

export const speaking01Activity: LearningActivity = {
  id: "SPEAK-SVO-01",
  title: "Say the sentence",
  type: "speech-production",
  level: "sentence",
  pattern: "SVO",
  availableUnits: ["Anna likes music."],
  expectedUnits: ["Anna likes music."],
  skillIds: ["basic-svo-speaking"],
};

export type Speaking01AttemptInput = {
  recognition: SpeakingRecognitionResult;
  activity: LearningActivity;
  session: SessionState;
  evidenceEngine: EvidenceEngine;
  assessmentEngine: AssessmentEngine;
  progressEngine: ProgressEngine;
};

export type Speaking01AttemptResult = {
  feedback: "incomplete" | "incorrect" | "correct";
  interaction?: SubmitAnswerInteraction;
  evidence?: SubmitAnswerEvidence;
  assessment?: SubmitAnswerAssessment;
  progress?: ProgressRecord;
};

export async function submitSpeaking01Attempt(
  {
    recognition,
    activity,
    session,
    evidenceEngine,
    assessmentEngine,
    progressEngine,
  }: Speaking01AttemptInput,
): Promise<Speaking01AttemptResult> {
  if (!recognition.recognizedText) {
    return { feedback: "incomplete" };
  }

  const interaction = createSubmitAnswerInteraction({
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    submittedUnits: [recognition.recognizedText],
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

  return {
    feedback: assessment.correct ? "correct" : "incorrect",
    interaction,
    evidence,
    assessment,
    progress,
  };
}
