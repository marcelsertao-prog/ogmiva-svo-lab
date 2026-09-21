import type {
  Speaking01Recognizer,
  SpeakingRecognitionResult,
} from "./speaking-01";

type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly [index: number]: {
    readonly transcript: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  readonly results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start(): void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export function createBrowserSpeaking01Recognizer(
  SpeechRecognition: BrowserSpeechRecognitionConstructor,
): Speaking01Recognizer {
  return async (): Promise<SpeakingRecognitionResult> =>
    new Promise((resolve) => {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        for (const result of Array.from(event.results)) {
          if (!result.isFinal) continue;

          resolve({ recognizedText: result[0]?.transcript ?? null });
          return;
        }
      };
      recognition.start();
    });
}
