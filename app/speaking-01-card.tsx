import type {
  Speaking01AttemptResult,
  SpeakingRecognitionResult,
} from "./speaking-01";

export type Speaking01CardProps = {
  isUnlocked: boolean;
  recognizedText: SpeakingRecognitionResult["recognizedText"];
  feedback: Speaking01AttemptResult["feedback"] | "idle";
};

export function Speaking01Card(props: Speaking01CardProps) {
  const isUnlocked = props.isUnlocked;

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
        <div className="journey-card-footer">
          <span className="pattern-chip">S + V + O · Speaking</span>
          <span className="coming-soon">
            {isUnlocked
              ? "Experimento disponível"
              : "Complete Listening 01 to unlock Speaking 01."}
          </span>
        </div>
      </div>
    </article>
  );
}
