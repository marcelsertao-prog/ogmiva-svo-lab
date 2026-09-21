import type {
  Speaking01Recognizer,
  SpeakingRecognitionResult,
} from "./speaking-01";
import { SpeakingRecognitionError } from "./speaking-01.ts";

type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly [index: number]: {
    readonly transcript: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  readonly results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognitionErrorEvent = {
  readonly error: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export function createBrowserSpeaking01Recognizer(
  SpeechRecognition: BrowserSpeechRecognitionConstructor,
): Speaking01Recognizer {
  return async (): Promise<SpeakingRecognitionResult> =>
    new Promise((resolve, reject) => {
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
      recognition.onerror = (event) => {
        if (event.error === "no-speech") {
          resolve({ recognizedText: null });
          return;
        }

        if (event.error === "not-allowed") {
          reject(new SpeakingRecognitionError("permission-denied"));
          return;
        }

        if (event.error === "audio-capture") {
          reject(new SpeakingRecognitionError("microphone-unavailable"));
        }
      };
      recognition.onend = () => {
        resolve({ recognizedText: null });
      };
      recognition.start();
    });
}
