import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createServer as createViteServer } from "vite";

const browserGlobalNames = [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "localStorage",
];

function installTestDom() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
  });
  const previousDescriptors = new Map(
    browserGlobalNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );

  for (const name of browserGlobalNames) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: dom.window[name],
    });
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });

  return {
    dom,
    restore() {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
      for (const [name, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(globalThis, name, descriptor);
        } else {
          delete globalThis[name];
        }
      }
      dom.window.close();
    },
  };
}

function InteractionProbe() {
  const [activated, setActivated] = useState(false);

  return createElement(
    "button",
    { type: "button", onClick: () => setActivated(true) },
    activated ? "Activated" : "Ready",
  );
}

async function mountLearnerJourney(props, { prepareWindow } = {}) {
  const testDom = installTestDom();
  let root;
  let vite;

  async function cleanup() {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    await vite?.close();
    testDom.restore();
  }

  try {
    prepareWindow?.(window);
    vite = await createViteServer({
      root: fileURLToPath(new URL("..", import.meta.url)),
      configFile: false,
      server: { middlewareMode: true },
      appType: "custom",
    });
    const { LearnerJourney } = await vite.ssrLoadModule(
      "/app/learner-journey.tsx",
    );
    const { createRoot } = await import("react-dom/client");
    const container = document.querySelector("#root");
    assert.ok(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(LearnerJourney, props));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    return { container, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

test("mounts, interacts with, and unmounts a React component", async () => {
  const testDom = installTestDom();

  try {
    const { createRoot } = await import("react-dom/client");
    const container = document.querySelector("#root");
    assert.ok(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(InteractionProbe));
    });
    const button = container.querySelector("button");
    assert.ok(button);
    assert.equal(button.textContent, "Ready");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(button.textContent, "Activated");

    await act(async () => {
      root.unmount();
    });
    assert.equal(container.innerHTML, "");
  } finally {
    testDom.restore();
  }
});

test("submits a controlled Speaking 01 recognition for the active learner", async () => {
  const recognizedLearnerIds = [];
  const mounted = await mountLearnerJourney({
    learnerId: "learner-2",
    initialProgress: {
      learnerId: "learner-2",
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
    recognizeSpeaking01: async ({ learnerId }) => {
      recognizedLearnerIds.push(learnerId);
      return { recognizedText: "Anna likes music." };
    },
  });

  try {
    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);
    assert.match(startButton.textContent ?? "", /Start speaking/);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.deepEqual(recognizedLearnerIds, ["learner-2"]);
    assert.match(speakingCard.textContent ?? "", /I heard:/);
    assert.match(speakingCard.textContent ?? "", /Anna likes music\./);
    assert.match(speakingCard.textContent ?? "", /Great speaking!/);
  } finally {
    await mounted.cleanup();
  }
});

test("prefers restored server progress over stale local progress", async () => {
  const learnerId = "learner-1";
  const mounted = await mountLearnerJourney({
    learnerId,
    initialProgress: {
      learnerId,
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
  }, {
    prepareWindow(browserWindow) {
      browserWindow.localStorage.setItem(
        `spread11:${learnerId}:svo-progress`,
        JSON.stringify({
          learnerId,
          completedActivityIds: ["SVO-01"],
          completedListeningActivityIds: [],
        }),
      );
    },
  });

  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const stage = mounted.container.querySelector(
      '[data-stage-id="SVO-LISTENING-01"]',
    );
    assert.ok(stage);
    assert.equal(stage.getAttribute("data-stage-progress"), "2/2");
    assert.equal(stage.getAttribute("data-stage-state"), "complete");
  } finally {
    await mounted.cleanup();
  }
});

test("preserves newer local completion when server progress is stale", async () => {
  const learnerId = "learner-1";
  const mounted = await mountLearnerJourney({
    learnerId,
    initialProgress: {
      learnerId,
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: [],
    },
  }, {
    prepareWindow(browserWindow) {
      browserWindow.localStorage.setItem(
        `spread11:${learnerId}:svo-progress`,
        JSON.stringify({
          learnerId,
          completedActivityIds: ["SVO-01"],
          completedListeningActivityIds: ["LISTEN-SVO-01"],
        }),
      );
    },
  });

  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const stage = mounted.container.querySelector(
      '[data-stage-id="SVO-LISTENING-01"]',
    );
    assert.ok(stage);
    assert.equal(stage.getAttribute("data-stage-progress"), "2/2");
    assert.equal(stage.getAttribute("data-stage-state"), "complete");
  } finally {
    await mounted.cleanup();
  }
});

test("shows unsynced progress after an HTTP 503 response", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 503 });
  });

  const mounted = await mountLearnerJourney({
    learnerId: "learner-2",
    initialProgress: {
      learnerId: "learner-2",
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
    recognizeSpeaking01: async () => ({
      recognizedText: "Anna likes music.",
    }),
  });

  try {
    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(requests.length, 1);
    const storedProgress = JSON.parse(
      window.localStorage.getItem("spread11:learner-2:svo-progress"),
    );
    assert.equal(storedProgress.progressRecords.length, 1);
    assert.equal(storedProgress.progressRecords[0].activityId, "SPEAK-SVO-01");
    assert.match(
      mounted.container.textContent ?? "",
      /Progresso ainda não sincronizado/i,
    );
  } finally {
    await mounted.cleanup();
  }
});

test("persists the correct Speaking 01 ProgressRecord for the active learner", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 204 });
  });

  const mounted = await mountLearnerJourney({
    learnerId: "learner-2",
    initialProgress: {
      learnerId: "learner-2",
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
    recognizeSpeaking01: async () => ({
      recognizedText: "Anna likes music.",
    }),
  });

  try {
    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request.url, "http://localhost/api/learner-progress");
    assert.equal(request.method, "POST");

    const snapshot = await request.json();
    assert.equal(snapshot.learnerId, "learner-2");
    assert.deepEqual(snapshot.completedActivityIds, ["SVO-01"]);
    assert.deepEqual(
      snapshot.completedListeningActivityIds,
      ["LISTEN-SVO-01"],
    );
    assert.equal(snapshot.progressRecords.length, 1);

    const [progressRecord] = snapshot.progressRecords;
    assert.equal(progressRecord.learnerId, "learner-2");
    assert.equal(progressRecord.activityId, "SPEAK-SVO-01");
    assert.equal(progressRecord.skillId, "basic-svo-speaking");
    assert.equal(progressRecord.completed, true);
    assert.equal(progressRecord.score, 1);
    assert.equal(typeof progressRecord.recordedAt, "string");
    assert.equal(Object.hasOwn(snapshot, "audio"), false);
    assert.equal(Object.hasOwn(snapshot, "recognizedText"), false);
    assert.equal(Object.hasOwn(progressRecord, "audio"), false);
    assert.equal(Object.hasOwn(progressRecord, "recognizedText"), false);
  } finally {
    await mounted.cleanup();
  }
});

test("persists an incorrect Listening 01 assessment without completing the activity", async (t) => {
  const requests = [];
  const previousSpeechSynthesisUtterance = Object.getOwnPropertyDescriptor(
    globalThis,
    "SpeechSynthesisUtterance",
  );
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 204 });
  });

  const mounted = await mountLearnerJourney({
    learnerId: "learner-1",
    initialProgress: {
      learnerId: "learner-1",
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: [],
    },
  }, {
    prepareWindow(browserWindow) {
      const SpeechSynthesisUtterance = class {
        onend;
      };
      browserWindow.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      globalThis.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      browserWindow.speechSynthesis = {
        cancel() {},
        speak(utterance) {
          utterance.onend?.();
        },
      };
    },
  });

  try {
    const listeningCard = mounted.container.querySelector(".stage-listening");
    assert.ok(listeningCard);
    const playButton = listeningCard.querySelector(".audio-button");
    assert.ok(playButton);

    await act(async () => {
      playButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const incorrectChoice = listeningCard.querySelector(
      'input[name="listening-svo-choice"][value="Likes Anna music."]',
    );
    assert.ok(incorrectChoice);

    await act(async () => {
      incorrectChoice.click();
    });

    const checkButton = listeningCard.querySelector(
      ".listening-actions button",
    );
    assert.ok(checkButton);

    await act(async () => {
      checkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.match(
      listeningCard.querySelector('[role="alert"]')?.textContent ?? "",
      /Not quite/,
    );
    assert.equal(requests.length, 1);

    const [request] = requests;
    assert.equal(request.url, "http://localhost/api/learner-progress");
    assert.equal(request.method, "POST");

    const snapshot = await request.json();
    assert.equal(snapshot.progressRecords.length, 1);
    const [progressRecord] = snapshot.progressRecords;
    assert.equal(progressRecord.activityId, "LISTEN-SVO-01");
    assert.equal(progressRecord.completed, false);
    assert.equal(progressRecord.score, 0);
    assert.equal(typeof progressRecord.recordedAt, "string");
    assert.equal(
      snapshot.completedListeningActivityIds.includes("LISTEN-SVO-01"),
      false,
    );
  } finally {
    if (previousSpeechSynthesisUtterance) {
      Object.defineProperty(
        globalThis,
        "SpeechSynthesisUtterance",
        previousSpeechSynthesisUtterance,
      );
    } else {
      delete globalThis.SpeechSynthesisUtterance;
    }
    await mounted.cleanup();
  }
});

test("persists an incorrect Listening 02 assessment without completing the activity", async (t) => {
  const requests = [];
  const previousSpeechSynthesisUtterance = Object.getOwnPropertyDescriptor(
    globalThis,
    "SpeechSynthesisUtterance",
  );
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 204 });
  });

  const mounted = await mountLearnerJourney({
    learnerId: "learner-1",
    initialProgress: {
      learnerId: "learner-1",
      completedActivityIds: ["SVO-01", "SVO-02"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
  }, {
    prepareWindow(browserWindow) {
      const SpeechSynthesisUtterance = class {
        onend;
      };
      browserWindow.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      globalThis.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      browserWindow.speechSynthesis = {
        cancel() {},
        speak(utterance) {
          utterance.onend?.();
        },
      };
    },
  });

  try {
    const listeningCard = mounted.container.querySelector(
      '.stage-listening[aria-labelledby="listening-02-title"]',
    );
    assert.ok(listeningCard);
    assert.match(listeningCard.textContent ?? "", /Listening 02/);

    const playButton = listeningCard.querySelector(".audio-button");
    assert.ok(playButton);
    assert.match(playButton.textContent ?? "", /Continue to Listening 02/);

    await act(async () => {
      playButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    for (const label of ["letters", "Maya", "writes"]) {
      const tile = [...listeningCard.querySelectorAll(".word-bank .word-tile")]
        .find((candidate) => candidate.textContent?.trim() === label);
      assert.ok(tile);
      await act(async () => {
        tile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    assert.deepEqual(
      [...listeningCard.querySelectorAll(".answer-zone .word-tile")]
        .map((tile) => tile.textContent?.replace(/^\d+/, "").trim()),
      ["letters", "Maya", "writes"],
    );

    const checkButton = [...listeningCard.querySelectorAll(
      ".listening-actions button",
    )].find((button) => button.textContent?.includes("Check reconstruction"));
    assert.ok(checkButton);

    await act(async () => {
      checkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.match(
      listeningCard.querySelector('[role="alert"]')?.textContent ?? "",
      /Not quite/,
    );
    assert.equal(requests.length, 1);

    const [request] = requests;
    assert.equal(request.url, "http://localhost/api/learner-progress");
    assert.equal(request.method, "POST");

    const snapshot = await request.json();
    assert.equal(snapshot.progressRecords.length, 1);
    const [progressRecord] = snapshot.progressRecords;
    assert.equal(progressRecord.activityId, "LISTEN-SVO-02");
    assert.equal(progressRecord.completed, false);
    assert.equal(progressRecord.score, 0);
    assert.equal(typeof progressRecord.recordedAt, "string");
    assert.equal(
      new Date(progressRecord.recordedAt).toISOString(),
      progressRecord.recordedAt,
    );
    assert.equal(
      snapshot.completedListeningActivityIds.includes("LISTEN-SVO-02"),
      false,
    );
  } finally {
    if (previousSpeechSynthesisUtterance) {
      Object.defineProperty(
        globalThis,
        "SpeechSynthesisUtterance",
        previousSpeechSynthesisUtterance,
      );
    } else {
      delete globalThis.SpeechSynthesisUtterance;
    }
    await mounted.cleanup();
  }
});

test("persists an incorrect Listening 03 assessment without completing the activity", async (t) => {
  const requests = [];
  const previousSpeechSynthesisUtterance = Object.getOwnPropertyDescriptor(
    globalThis,
    "SpeechSynthesisUtterance",
  );
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 204 });
  });

  const mounted = await mountLearnerJourney({
    learnerId: "learner-1",
    initialProgress: {
      learnerId: "learner-1",
      completedActivityIds: ["SVO-01", "SVO-02", "SVO-03"],
      completedListeningActivityIds: ["LISTEN-SVO-01", "LISTEN-SVO-02"],
    },
  }, {
    prepareWindow(browserWindow) {
      const SpeechSynthesisUtterance = class {
        onend;
      };
      browserWindow.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      globalThis.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      browserWindow.speechSynthesis = {
        cancel() {},
        speak(utterance) {
          utterance.onend?.();
        },
      };
    },
  });

  try {
    const listeningCard = mounted.container.querySelector(
      '.stage-listening[aria-labelledby="listening-03-title"]',
    );
    assert.ok(listeningCard);
    assert.match(listeningCard.textContent ?? "", /Listening 03/);

    const playButton = listeningCard.querySelector(".audio-button");
    assert.ok(playButton);
    assert.match(playButton.textContent ?? "", /Continue to Listening 03/);

    await act(async () => {
      playButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    for (const label of ["Daniel", "writes", "books"]) {
      const tile = [...listeningCard.querySelectorAll(".word-bank .word-tile")]
        .find((candidate) => candidate.textContent?.trim() === label);
      assert.ok(tile);
      await act(async () => {
        tile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    assert.deepEqual(
      [...listeningCard.querySelectorAll(".answer-zone .word-tile")]
        .map((tile) => tile.textContent?.replace(/^\d+/, "").trim()),
      ["Daniel", "writes", "books"],
    );

    const checkButton = [...listeningCard.querySelectorAll(
      ".listening-actions button",
    )].find((button) => button.textContent?.includes("Check reconstruction"));
    assert.ok(checkButton);

    await act(async () => {
      checkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.match(
      listeningCard.querySelector('[role="alert"]')?.textContent ?? "",
      /Not quite/,
    );
    assert.equal(requests.length, 1);

    const [request] = requests;
    assert.equal(request.url, "http://localhost/api/learner-progress");
    assert.equal(request.method, "POST");

    const snapshot = await request.json();
    assert.equal(snapshot.progressRecords.length, 1);
    const [progressRecord] = snapshot.progressRecords;
    assert.equal(progressRecord.activityId, "LISTEN-SVO-03");
    assert.equal(progressRecord.completed, false);
    assert.equal(progressRecord.score, 2 / 3);
    assert.equal(typeof progressRecord.recordedAt, "string");
    assert.equal(
      new Date(progressRecord.recordedAt).toISOString(),
      progressRecord.recordedAt,
    );
    assert.equal(
      snapshot.completedListeningActivityIds.includes("LISTEN-SVO-03"),
      false,
    );
  } finally {
    if (previousSpeechSynthesisUtterance) {
      Object.defineProperty(
        globalThis,
        "SpeechSynthesisUtterance",
        previousSpeechSynthesisUtterance,
      );
    } else {
      delete globalThis.SpeechSynthesisUtterance;
    }
    await mounted.cleanup();
  }
});

test("persists an incorrect Listening 04 assessment without completing the activity", async (t) => {
  const requests = [];
  const previousSpeechSynthesisUtterance = Object.getOwnPropertyDescriptor(
    globalThis,
    "SpeechSynthesisUtterance",
  );
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 204 });
  });

  const mounted = await mountLearnerJourney({
    learnerId: "learner-1",
    initialProgress: {
      learnerId: "learner-1",
      completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04"],
      completedListeningActivityIds: [
        "LISTEN-SVO-01", "LISTEN-SVO-02", "LISTEN-SVO-03",
      ],
    },
  }, {
    prepareWindow(browserWindow) {
      const SpeechSynthesisUtterance = class {
        onend;
      };
      browserWindow.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      globalThis.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      browserWindow.speechSynthesis = {
        cancel() {},
        speak(utterance) {
          utterance.onend?.();
        },
      };
    },
  });

  try {
    const listeningCard = mounted.container.querySelector(
      '.stage-listening[aria-labelledby="listening-04-title"]',
    );
    assert.ok(listeningCard);
    assert.match(listeningCard.textContent ?? "", /Listening 04/);

    const playButton = listeningCard.querySelector(".audio-button");
    assert.ok(playButton);
    await act(async () => {
      playButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    for (const [role, label] of [
      ["Subject", "Laura"],
      ["Verb", "reads"],
      ["Object", "tennis"],
    ]) {
      const slot = [...listeningCard.querySelectorAll(".listening-role-slot")]
        .find((button) => button.getAttribute("aria-label") === `Select ${role} slot`);
      assert.ok(slot);
      await act(async () => {
        slot.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const tile = [...listeningCard.querySelectorAll(".word-bank .word-tile")]
        .find((button) => button.textContent?.trim() === label);
      assert.ok(tile);
      await act(async () => {
        tile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const checkButton = [...listeningCard.querySelectorAll(
      ".listening-actions button",
    )].find((button) => button.textContent?.includes("Check roles"));
    assert.ok(checkButton);

    await act(async () => {
      checkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.match(
      listeningCard.querySelector('[role="alert"]')?.textContent ?? "",
      /Not quite/,
    );
    assert.equal(requests.length, 1);

    const [request] = requests;
    assert.equal(request.url, "http://localhost/api/learner-progress");
    assert.equal(request.method, "POST");

    const snapshot = await request.json();
    assert.equal(snapshot.progressRecords.length, 1);
    const [progressRecord] = snapshot.progressRecords;
    assert.equal(progressRecord.activityId, "LISTEN-SVO-04");
    assert.equal(progressRecord.completed, false);
    assert.equal(progressRecord.score, 2 / 3);
    assert.equal(typeof progressRecord.recordedAt, "string");
    assert.equal(
      new Date(progressRecord.recordedAt).toISOString(),
      progressRecord.recordedAt,
    );
    assert.equal(
      snapshot.completedListeningActivityIds.includes("LISTEN-SVO-04"),
      false,
    );
  } finally {
    if (previousSpeechSynthesisUtterance) {
      Object.defineProperty(
        globalThis,
        "SpeechSynthesisUtterance",
        previousSpeechSynthesisUtterance,
      );
    } else {
      delete globalThis.SpeechSynthesisUtterance;
    }
    await mounted.cleanup();
  }
});

test("persists an incorrect Listening 05 assessment without completing the activity", async (t) => {
  const requests = [];
  const previousSpeechSynthesisUtterance = Object.getOwnPropertyDescriptor(
    globalThis,
    "SpeechSynthesisUtterance",
  );
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(new URL(String(input), "http://localhost"), init);
    requests.push(request);
    return new Response(null, { status: 204 });
  });

  const mounted = await mountLearnerJourney({
    learnerId: "learner-1",
    initialProgress: {
      learnerId: "learner-1",
      completedActivityIds: ["SVO-01", "SVO-02", "SVO-03", "SVO-04", "SVO-05"],
      completedListeningActivityIds: [
        "LISTEN-SVO-01", "LISTEN-SVO-02", "LISTEN-SVO-03", "LISTEN-SVO-04",
      ],
    },
  }, {
    prepareWindow(browserWindow) {
      const SpeechSynthesisUtterance = class {
        onend;
      };
      browserWindow.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      globalThis.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
      browserWindow.speechSynthesis = {
        cancel() {},
        speak(utterance) {
          utterance.onend?.();
        },
      };
    },
  });

  try {
    const listeningCard = mounted.container.querySelector(
      '.stage-listening[aria-labelledby="listening-05-title"]',
    );
    assert.ok(listeningCard);
    assert.match(listeningCard.textContent ?? "", /Listening 05/);

    const playButton = listeningCard.querySelector(".audio-button");
    assert.ok(playButton);
    await act(async () => {
      playButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    for (const [role, label] of [
      ["Subject", "Carlos"],
      ["Verb", "plays"],
      ["Object", "movies"],
    ]) {
      const slot = [...listeningCard.querySelectorAll(".listening-role-slot")]
        .find((button) => button.getAttribute("aria-label") === `Select ${role} slot`);
      assert.ok(slot);
      await act(async () => {
        slot.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const tile = [...listeningCard.querySelectorAll(".word-bank .word-tile")]
        .find((button) => button.textContent?.trim() === label);
      assert.ok(tile);
      await act(async () => {
        tile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const checkButton = [...listeningCard.querySelectorAll(
      ".listening-actions button",
    )].find((button) => button.textContent?.includes("Check roles"));
    assert.ok(checkButton);

    await act(async () => {
      checkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.match(
      listeningCard.querySelector('[role="alert"]')?.textContent ?? "",
      /Not quite/,
    );
    assert.equal(requests.length, 1);

    const [request] = requests;
    assert.equal(request.url, "http://localhost/api/learner-progress");
    assert.equal(request.method, "POST");

    const snapshot = await request.json();
    assert.equal(snapshot.progressRecords.length, 1);
    const [progressRecord] = snapshot.progressRecords;
    assert.equal(progressRecord.activityId, "LISTEN-SVO-05");
    assert.equal(progressRecord.completed, false);
    assert.equal(progressRecord.score, 2 / 3);
    assert.equal(typeof progressRecord.recordedAt, "string");
    assert.equal(
      new Date(progressRecord.recordedAt).toISOString(),
      progressRecord.recordedAt,
    );
    assert.equal(
      snapshot.completedListeningActivityIds.includes("LISTEN-SVO-05"),
      false,
    );
  } finally {
    if (previousSpeechSynthesisUtterance) {
      Object.defineProperty(
        globalThis,
        "SpeechSynthesisUtterance",
        previousSpeechSynthesisUtterance,
      );
    } else {
      delete globalThis.SpeechSynthesisUtterance;
    }
    await mounted.cleanup();
  }
});

test("prevents duplicate Speaking 01 attempts while recognition is pending", async () => {
  let recognitionCount = 0;
  let resolveRecognition;
  const pendingRecognition = new Promise((resolve) => {
    resolveRecognition = resolve;
  });
  const mounted = await mountLearnerJourney({
    learnerId: "learner-2",
    initialProgress: {
      learnerId: "learner-2",
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
    recognizeSpeaking01: async () => {
      recognitionCount += 1;
      return pendingRecognition;
    },
  });

  try {
    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(recognitionCount, 1);
    assert.equal(startButton.disabled, true);
    assert.match(startButton.textContent ?? "", /Listening…/);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(recognitionCount, 1);
  } finally {
    await act(async () => {
      resolveRecognition?.({ recognizedText: "Anna likes music." });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await mounted.cleanup();
  }
});

async function assertBrowserRecognitionFlow(recognitionProperty) {
  let startCount = 0;

  class ControlledBrowserSpeechRecognition {
    start() {
      startCount += 1;
      this.onresult?.({
        results: [{
          0: { transcript: "Anna likes music." },
          isFinal: true,
        }],
      });
    }
  }

  const mounted = await mountLearnerJourney({
    learnerId: "learner-2",
    initialProgress: {
      learnerId: "learner-2",
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
  }, {
    prepareWindow(browserWindow) {
      delete browserWindow.SpeechRecognition;
      delete browserWindow.webkitSpeechRecognition;
      browserWindow[recognitionProperty] = ControlledBrowserSpeechRecognition;
    },
  });

  try {
    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);
    assert.match(startButton.textContent ?? "", /Start speaking/);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(startCount, 1);
    assert.match(speakingCard.textContent ?? "", /I heard:/);
    assert.match(speakingCard.textContent ?? "", /Anna likes music\./);
    assert.match(speakingCard.textContent ?? "", /Great speaking!/);
  } finally {
    await mounted.cleanup();
  }
}

test("uses native browser recognition for an available Speaking 01 activity", async () => {
  await assertBrowserRecognitionFlow("SpeechRecognition");
});

test("uses prefixed browser recognition for an available Speaking 01 activity", async () => {
  await assertBrowserRecognitionFlow("webkitSpeechRecognition");
});

async function assertTechnicalBrowserRecognitionFailure({
  completeRecognition,
  expectedMessage,
}) {
  let startCount = 0;
  let speakingSessionCount = 0;
  let progressRecordCount = 0;
  const { DefaultSessionEngine } = await import("@seal-sdk/session");
  const { DefaultProgressEngine } = await import("@seal-sdk/progress");
  const originalCreateSession = DefaultSessionEngine.prototype.createSession;
  const originalRecordAssessment =
    DefaultProgressEngine.prototype.recordAssessment;

  DefaultSessionEngine.prototype.createSession = async function (input) {
    if (input.activityId === "SPEAK-SVO-01") speakingSessionCount += 1;
    return originalCreateSession.call(this, input);
  };
  DefaultProgressEngine.prototype.recordAssessment = async function (input) {
    progressRecordCount += 1;
    return originalRecordAssessment.call(this, input);
  };

  class FailedSpeechRecognition {
    start() {
      startCount += 1;
      completeRecognition(this);
    }
  }

  let mounted;

  try {
    mounted = await mountLearnerJourney({
      learnerId: "learner-2",
      initialProgress: {
        learnerId: "learner-2",
        completedActivityIds: ["SVO-01"],
        completedListeningActivityIds: ["LISTEN-SVO-01"],
      },
    }, {
      prepareWindow(browserWindow) {
        delete browserWindow.webkitSpeechRecognition;
        browserWindow.SpeechRecognition = FailedSpeechRecognition;
      },
    });

    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(startCount, 1);
    assert.equal(speakingSessionCount, 0);
    assert.equal(progressRecordCount, 0);
    assert.match(speakingCard.textContent ?? "", expectedMessage);
    assert.doesNotMatch(speakingCard.textContent ?? "", /I heard:/);
    assert.doesNotMatch(speakingCard.textContent ?? "", /Great speaking!/);
    assert.doesNotMatch(speakingCard.textContent ?? "", /Not quite/);
    assert.doesNotMatch(
      speakingCard.textContent ?? "",
      /I couldn’t hear a complete sentence\./,
    );
  } finally {
    DefaultSessionEngine.prototype.createSession = originalCreateSession;
    DefaultProgressEngine.prototype.recordAssessment =
      originalRecordAssessment;
    await mounted?.cleanup();
  }
}

test("fails closed when Speaking 01 microphone permission is denied", async () => {
  await assertTechnicalBrowserRecognitionFailure({
    completeRecognition(recognition) {
      recognition.onerror?.({ error: "not-allowed" });
    },
    expectedMessage: /Microphone access is required to use Speaking 01\./,
  });
});

async function assertIncompleteBrowserRecognition(completeRecognition) {
  let startCount = 0;
  let progressRecordCount = 0;
  const { DefaultProgressEngine } = await import("@seal-sdk/progress");
  const originalRecordAssessment =
    DefaultProgressEngine.prototype.recordAssessment;

  DefaultProgressEngine.prototype.recordAssessment = async function (input) {
    progressRecordCount += 1;
    return originalRecordAssessment.call(this, input);
  };

  class IncompleteSpeechRecognition {
    start() {
      startCount += 1;
      completeRecognition(this);
    }
  }

  let mounted;

  try {
    mounted = await mountLearnerJourney({
      learnerId: "learner-2",
      initialProgress: {
        learnerId: "learner-2",
        completedActivityIds: ["SVO-01"],
        completedListeningActivityIds: ["LISTEN-SVO-01"],
      },
    }, {
      prepareWindow(browserWindow) {
        delete browserWindow.webkitSpeechRecognition;
        browserWindow.SpeechRecognition = IncompleteSpeechRecognition;
      },
    });

    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(startCount, 1);
    assert.equal(progressRecordCount, 0);
    assert.match(
      speakingCard.textContent ?? "",
      /I couldn’t hear a complete sentence\./,
    );
    assert.match(speakingCard.textContent ?? "", /Try speaking again\./);
    assert.doesNotMatch(speakingCard.textContent ?? "", /I heard:/);
    assert.doesNotMatch(speakingCard.textContent ?? "", /Great speaking!/);
    assert.doesNotMatch(speakingCard.textContent ?? "", /Not quite/);
  } finally {
    DefaultProgressEngine.prototype.recordAssessment =
      originalRecordAssessment;
    await mounted?.cleanup();
  }
}

test("presents an incomplete Speaking 01 attempt when no speech is recognized", async () => {
  await assertIncompleteBrowserRecognition((recognition) => {
    recognition.onerror?.({ error: "no-speech" });
  });
});

test("presents an incomplete Speaking 01 attempt when recognition ends without a result", async () => {
  await assertIncompleteBrowserRecognition((recognition) => {
    recognition.onend?.();
  });
});

test("fails closed when Speaking 01 cannot detect a microphone", async () => {
  await assertTechnicalBrowserRecognitionFailure({
    completeRecognition(recognition) {
      recognition.onerror?.({ error: "audio-capture" });
    },
    expectedMessage:
      /A microphone could not be detected\. Check your device and try again\./,
  });
});

test("fails closed when Speaking 01 recognition has a network error", async () => {
  await assertTechnicalBrowserRecognitionFailure({
    completeRecognition(recognition) {
      recognition.onerror?.({ error: "network" });
      recognition.onend?.();
    },
    expectedMessage:
      /Speech recognition is temporarily unavailable\. Try again\./,
  });
});

test("fails closed when Speaking 01 recognition is unavailable in the browser", async () => {
  const mounted = await mountLearnerJourney({
    learnerId: "learner-2",
    initialProgress: {
      learnerId: "learner-2",
      completedActivityIds: ["SVO-01"],
      completedListeningActivityIds: ["LISTEN-SVO-01"],
    },
  }, {
    prepareWindow(browserWindow) {
      delete browserWindow.SpeechRecognition;
      delete browserWindow.webkitSpeechRecognition;
    },
  });

  try {
    const speakingCard = mounted.container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    assert.equal(speakingCard.getAttribute("data-activity-state"), "available");
    assert.equal(
      speakingCard.querySelector('[data-speaking-action="start"]'),
      null,
    );
    assert.match(
      speakingCard.textContent ?? "",
      /Speech recognition is not available in this browser\./,
    );
    assert.doesNotMatch(speakingCard.textContent ?? "", /I heard:/);
    assert.doesNotMatch(speakingCard.textContent ?? "", /Great speaking!/);
  } finally {
    await mounted.cleanup();
  }
});
