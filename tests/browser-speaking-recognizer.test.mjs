import assert from "node:assert/strict";
import test from "node:test";

async function loadBrowserSpeakingRecognizer() {
  try {
    return await import("../app/browser-speaking-recognizer.ts");
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND"
      && String(error.message).includes("browser-speaking-recognizer")
    ) {
      return {};
    }
    throw error;
  }
}

test("recognizes one final English Speaking 01 result through the browser adapter", async () => {
  const { createBrowserSpeaking01Recognizer } =
    await loadBrowserSpeakingRecognizer();

  assert.equal(
    typeof createBrowserSpeaking01Recognizer,
    "function",
    "the optional browser recognizer adapter should be available",
  );

  let recognitionConfiguration;
  let startCount = 0;

  class ControlledSpeechRecognition {
    start() {
      startCount += 1;
      recognitionConfiguration = {
        lang: this.lang,
        continuous: this.continuous,
        interimResults: this.interimResults,
        maxAlternatives: this.maxAlternatives,
      };
      this.onresult?.({
        results: [{
          0: { transcript: "Anna likes" },
          isFinal: false,
        }],
      });
      this.onresult?.({
        results: [{
          0: { transcript: "Anna likes music." },
          isFinal: true,
        }],
      });
    }
  }

  const recognizeSpeaking01 = createBrowserSpeaking01Recognizer(
    ControlledSpeechRecognition,
  );
  const result = await recognizeSpeaking01({ learnerId: "learner-2" });

  assert.equal(startCount, 1);
  assert.deepEqual(recognitionConfiguration, {
    lang: "en-US",
    continuous: false,
    interimResults: false,
    maxAlternatives: 1,
  });
  assert.deepEqual(result, { recognizedText: "Anna likes music." });
});
