import type {
  Speaking01AttemptResult,
  SpeakingRecognitionFailureCode,
  SpeakingRecognitionResult,
} from "./speaking-01";

export type Speaking01CardProps = {
  isUnlocked: boolean;
  recognizedText: SpeakingRecognitionResult["recognizedText"];
  feedback: Speaking01AttemptResult["feedback"] | "idle";
  recognitionFailure?: SpeakingRecognitionFailureCode | null;
  isRecognizing?: boolean;
  onStart?: () => void | Promise<void>;
};

const recognitionFailureMessages: Record<SpeakingRecognitionFailureCode, string> = {
  "permission-denied": "Microphone access is required to use Speaking 01.",
  "microphone-unavailable": "A microphone could not be detected. Check your device and try again.",
  "recognition-unavailable": "Speech recognition is temporarily unavailable. Try again.",
};

export function Speaking01Card(props: Speaking01CardProps) {
  const isUnlocked = props.isUnlocked;
  const recognitionFailureMessage = props.recognitionFailure
    ? recognitionFailureMessages[props.recognitionFailure]
    : null;

  return (
    <article
      className={`journey-card paired-activity speaking-extension ${isUnlocked ? "is-unlocked" : "is-locked"}`}
      data-activity-id="SPEAK-SVO-01"
      data-activity-state={isUnlocked ? "available" : "locked"}
    >
      <div className="journey-step" aria-hidden="true">1C</div>
      <div className="journey-card-copy">
        <div className="journey-card-meta">
          <span>1C · Speaking 01 · Experimental</span>
          <span className={`status-chip ${isUnlocked ? "available" : "locked"}`}>
            {isUnlocked ? "Disponível" : "Bloqueada"}
          </span>
        </div>
        <h2>Say the sentence</h2>
        <p>Pratique oralmente a mesma estrutura reconhecida em Listening 01.</p>
        {recognitionFailureMessage && (
          <div className="feedback neutral" role="alert">
            <span className="feedback-icon">···</span>
            <div>
              <strong>{recognitionFailureMessage}</strong>
            </div>
          </div>
        )}
        {props.recognizedText && (
          <div className="speaking-recognition" role="status">
            <strong>I heard:</strong>
            <p>{props.recognizedText}</p>
          </div>
        )}
        {props.feedback === "correct" && (
          <div className="feedback correct" role="status">
            <span className="feedback-icon">✓</span>
            <div>
              <strong>Great speaking!</strong>
              <p>You produced the expected sentence.</p>
            </div>
          </div>
        )}
        {props.feedback === "incorrect" && (
          <div className="feedback incorrect" role="alert">
            <span className="feedback-icon">↺</span>
            <div>
              <strong>Not quite — try again.</strong>
              <p>Say the sentence in Subject + Verb + Object order.</p>
            </div>
          </div>
        )}
        {props.feedback === "incomplete" && (
          <div className="feedback neutral" role="status">
            <span className="feedback-icon">···</span>
            <div>
              <strong>I couldn’t hear a complete sentence.</strong>
              <p>Try speaking again.</p>
            </div>
          </div>
        )}
        <div className="journey-card-footer">
          <span className="pattern-chip">S + V + O · Speaking</span>
          {isUnlocked && props.onStart ? (
            <button
              className="primary-button"
              type="button"
              data-speaking-action="start"
              onClick={props.onStart}
              disabled={props.isRecognizing}
            >
              {props.isRecognizing ? "Listening…" : "Start speaking"} <span>→</span>
            </button>
          ) : (
            <span className="coming-soon">
              {isUnlocked
                ? "Speech recognition is not available in this browser."
                : "Complete Listening 01 to unlock Speaking 01."}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
